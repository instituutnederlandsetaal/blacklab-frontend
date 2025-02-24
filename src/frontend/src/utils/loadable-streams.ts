import { combineLatest, debounceTime, delay, distinctUntilChanged, EMPTY, filter, firstValueFrom, map, merge, mergeMap, Observable, ObservableInput, of, OperatorFunction, partition, pipe, race, ReplaySubject, startWith, Subject, Subscription, switchMap, take, takeUntil, tap, timer } from 'rxjs';
import jsonStableStringify from 'json-stable-stringify';
import { MarkRequiredAndNotNull } from '@/types/helpers';
import Vue, { markRaw } from 'vue';
import { ApiError } from '@/types/apptypes';
import { Canceler } from 'axios';

/**
 * Bunch of code for interop of streams and asynchronous/optional values.
 * E.g.
 * - Loadable<T> is a type that can represent a value that is loading, loaded, errored, or empty.
 * - asObservable() can turn an http request into a stream that emits loading, loaded, and error states.
 * - promiseFromLoadableStream() can turn a stream of Loadable<T> into a promise that resolves with T as soon as the stream emits a Loaded<T>.
 * - combineLoadables() can combine multiple Loadable<T> into a single Loadable<[T1, T2, ...]> that is loaded if all are loaded, and otherwise in the state of the first non-loaded one.
 * - the various mapLoaded/mergeMapLoaded/switchMapLoaded functions will run only for Loaded values, and will not run for Loading/Empty/Error states, which are passed through.
 *
 * Example code:
 * pipe(
 *   // begin with a url, make a get request to the url whenever it changes
 *   map<string, CancelableRequest<T>>(url => api.get(url)),
 *   // From the request/canceler, create a stream that emits loading, loaded, and error states.
 *   switchMap(request => asObservable(request)),
 *   // Every time the stream emits a value (loading, loaded, error), log it.
 *   tap(loadable => console.log(loadable))
 * )
 */

export enum LoadableState {
	Loading = 'loading',
	Loaded = 'loaded',
	Error = 'error',
	Empty = 'empty'
}

interface LoadableBase<T> {
	isLoading(): this is Loading<T>;
	isLoaded(): this is Loaded<T>;
	isError(): this is LoadingError<T>;
	isEmpty(): this is Empty<T>;
}

interface Loading<T> extends LoadableBase<T> {
	state: LoadableState.Loading
	value: undefined;
	error: undefined;
}

interface Empty<T> extends LoadableBase<T> {
	state: LoadableState.Empty;
	value: undefined;
	error: undefined;
}

interface Loaded<T> extends LoadableBase<T> {
	state: LoadableState.Loaded;
	value: T;
	error: undefined;
}

interface LoadingError<T> extends LoadableBase<T> {
	state: LoadableState.Error;
	value: undefined;
	error: ApiError;
}

interface TLoadable<T> extends LoadableBase<T> {
	value: T|undefined;
	error: ApiError|undefined;
	state: LoadableState;
}

export class Loadable<T> implements TLoadable<T> {
	protected constructor(
		public state: LoadableState,
		public value: T|undefined,
		public error: ApiError|undefined
	) {}

	// NOTE: don't do instanceof here, it breaks with InteractiveLoadble (which implements the behavior of these classes, but doesn't extend them)
	public isLoading(): this is Loading<T> { return this.state === LoadableState.Loading; }
	public isLoaded(): this is Loaded<T> { return this.state === LoadableState.Loaded; }
	public isError(): this is LoadingError<T> { return this.state === LoadableState.Error; }
	public isEmpty(): this is Empty<T> { return this.state === LoadableState.Empty; }

	public static isLoadable<T>(v: any): v is Loadable<T> { return v instanceof Loadable; }
	public static isLoading<T>(v: any): v is Loading<T> { return v instanceof Loadable && v.isLoading(); }
	public static isLoaded<T>(v: any): v is Loaded<T> { return v instanceof Loadable && v.isLoaded(); }
	public static isError<T>(v: any): v is LoadingError<T> { return v instanceof Loadable && v.isError(); }
	public static isEmpty<T>(v: any): v is Empty<T> { return v instanceof Loadable && v.isEmpty(); }

	public static Loading<T>(): Loading<T> { return new Loadable<T>(LoadableState.Loading, undefined, undefined) as Loading<T>; }
	public static Loaded<T>(value: T): Loaded<T> { return new Loadable<T>(LoadableState.Loaded, value, undefined) as Loaded<T>; }
	public static LoadingError<T>(error: ApiError): LoadingError<T> { return new Loadable<T>(LoadableState.Error, undefined, error) as LoadingError<T>; }
	public static Empty<T>(): Empty<T> { return new Loadable<T>(LoadableState.Empty, undefined, undefined) as Empty<T>; }
}

export class CancelableRequest<T> implements Promise<T> {
	public request: Promise<T>;
	public cancel: Canceler;
	constructor(request: Promise<T>, cancel: Canceler) {
		this.request = request;
		this.cancel = cancel;
	}

	get [Symbol.toStringTag]() { return 'CancelableRequest'; }

	public then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): CancelableRequest<TResult1 | TResult2> {
		return new CancelableRequest(this.request.then(onfulfilled, onrejected), this.cancel);
	}
	public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelableRequest<T | TResult> {
		return new CancelableRequest(this.request.catch(onrejected), this.cancel);
	}
	public finally(onfinally?: (() => void) | undefined | null): CancelableRequest<T> {
		return new CancelableRequest(this.request.finally(onfinally), this.cancel);
	}

	public static isCancelableRequest<T>(value: any): value is CancelableRequest<T> {
		return value instanceof CancelableRequest;
	}

	public toObservable(): Observable<Loadable<T>> {
		return toObservable(this);
	}
}

export namespace L {
	/**
	 * Given a type of Loadable<T>, return a Loadable<U>. Do it in such a way that the loading state is preserved if it is statically known.
	 * E.g. Loaded<T> -> Loaded<U>, Empty<T> -> Empty<U> etc.
	 */
	export type Replace<T extends Loadable<any>, U> =
		T extends Loaded<any> ? Loaded<U> :
		T extends LoadingError<any> ? LoadingError<U> :
		T extends Loading<any> ? Loading<U> :
		T extends Empty<any> ? Empty<U> :
		T extends Loadable<any> ? Loadable<U> :
		never;


	/** Given a Loadable<T>, return the T type. If the Loading state is statically known, return the statically known type of the .value. */
	export type Val<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<infer L> ? never :
		T extends LoadingError<infer L> ? never :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L :
		T;

	export type ValEmpty<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<infer L> ? undefined :
		T extends LoadingError<infer L> ? never :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L|undefined :
		T;

	export type ValError<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<infer L> ? never :
		T extends LoadingError<infer L> ? ApiError :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L|ApiError :
		T;

	export type ValEmptyAndError<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<infer L> ? undefined :
		T extends LoadingError<infer L> ? ApiError :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L|undefined|ApiError :
		T;
}


/**
 * Like map, but only call the mapper for Loadables of state S. The value the mapper returned is wrapped in a Loaded.
 * Other values are passed through.
 * E.g.:
 * ```
 * // input is extracted from the Loadable, mapped, and put back into a Loadable
 * mapLoadable<number, string>(LoadableState.Loaded, (v: number) => v + ' bananas')(Loadable.Loaded(5)) -> Loadable.Loaded('5 bananas')
 * // input doesn't match the state, so it's passed through
 * mapLoadable<number, string>(LoadableState.Loaded, (v: number) => v + ' bananas')(Loadable.Empty()) -> Loadable.Empty()
 * ```
 */
export function mapLoadable<T, U, S extends LoadableState.Loaded>(state: S, mapper: (v: T) => U): OperatorFunction<Loadable<T>, Loadable<U>>;
export function mapLoadable<T, U, S extends LoadableState.Error>(state: S, mapper: (v: ApiError) => U): OperatorFunction<Loadable<T>, Loadable<U|T>>;
export function mapLoadable<T, U, S extends LoadableState.Empty>(state: S, mapper: (v: undefined) => U): OperatorFunction<Loadable<T>, Loadable<U|T>>;
export function mapLoadable<T, U, S extends LoadableState.Loading>(state: S, mapper: (v: undefined) => U): OperatorFunction<Loadable<T>, Loadable<U|T>>;
export function mapLoadable<T, U, S extends LoadableState>(state: S, mapper: (v: T|ApiError|undefined) => U): OperatorFunction<Loadable<T>, Loadable<U|T>> {
	return map(v => {
		if (v.state !== state) return v;
		if (v.isError()) return Loadable.Loaded(mapper(v.error));
		if (v.isLoaded()) return Loadable.Loaded(mapper(v.value));
		return Loadable.Loaded(mapper(undefined));
	})
}
export const mapLoaded = mapLoadable.Loaded = <T, U>(mapper: (v: T) => U) => mapLoadable(LoadableState.Loaded, mapper);
export const mapError = mapLoadable.Error = <T, U>(mapper: (v: ApiError) => U) => mapLoadable(LoadableState.Error, mapper);
export const mapEmpty = mapLoadable.Empty = <T, U>(mapper: (v: undefined) => U) => mapLoadable(LoadableState.Empty, mapper);
export const mapLoading = mapLoadable.Loading = <T, U>(mapper: (v: undefined) => U) => mapLoadable(LoadableState.Loading, mapper);

/**
 * Like map, but only call the mapper for Loadables of state S. The mapper can directly return a Loadable<U>.
 * Other values are passed through.
 * In this way it is possible to replace a Loadable with another Loadable of a different state/value.
 * E.g:
 * ```
 * // input is extracted from the Loadable, mapped, and put back into a Loadable
 * flatMapLoadable<number, Loadable<string>>(LoadableState.Loaded, (v) => Loadable.Loaded(v.value + ' bananas'))(Loadable.Loaded(5)) -> Loadable.Loaded('5 bananas')
 * // input doesn't match the state, so it's passed through
 * flatMapLoadable<number, Loadable<string>>(LoadableState.Loaded, (v) => Loadable.Loaded(v.value + ' bananas'))(Loadable.Empty()) -> Loadable.Empty()
 * // and once more for good measure, replacing empty with a placeholder Loaded value for example:
 * flatMapLoadable<number, Loadable<string>>(LoadableState.Empty, () => Loadable.Loaded('placeholder'))(Loadable.Empty()) -> Loadable.Loaded('placeholder')
 * ```
 */
export function flatMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Loaded> (state: S, mapper: (v: T) => U): OperatorFunction<Loadable<T>, U>;
export function flatMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Error>  (state: S, mapper: (v: ApiError) => U): OperatorFunction<Loadable<T>, U|Loadable<T>>;
export function flatMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Empty>  (state: S, mapper: (v: undefined) => U): OperatorFunction<Loadable<T>, U|Loadable<T>>;
export function flatMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Loading>(state: S, mapper: (v: undefined) => U): OperatorFunction<Loadable<T>, U|Loadable<T>>;
export function flatMapLoadable<T, U extends Loadable<any>, S extends LoadableState>        (state: S, mapper: (v: T|ApiError|undefined) => U): OperatorFunction<Loadable<T>, U|Loadable<T>> {
	return map(v => {
		if (v.state !== state) return v;
		if (v.isError()) return mapper(v.error);
		if (v.isLoaded()) return mapper(v.value);
		return mapper(undefined);
	})
}
export const flatMapLoaded = flatMapLoadable.Loaded =   <T, U extends Loadable<any>>(mapper: (v: T) => U) => flatMapLoadable(LoadableState.Loaded, mapper);
export const flatMapError = flatMapLoadable.Error =     <T, U extends Loadable<any>>(mapper: (v: ApiError) => U) => flatMapLoadable(LoadableState.Error, mapper);
export const flatMapEmpty = flatMapLoadable.Empty =     <T, U extends Loadable<any>>(mapper: (v: undefined) => U) => flatMapLoadable(LoadableState.Empty, mapper);
export const flatMapLoading = flatMapLoadable.Loading = <T, U extends Loadable<any>>(mapper: (v: undefined) => U) => flatMapLoadable(LoadableState.Loading, mapper);


/**
 * Like mergeMap, but only call the mapper for Loadables of state S.
 * Other values are passed through.
 */
export function mergeMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Loaded>(state: S, mapper: (v: T) => ObservableInput<U>): OperatorFunction<Loadable<T>, U>;
export function mergeMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Error>(state: S, mapper: (v: ApiError) => ObservableInput<U>): OperatorFunction<Loadable<T>, U|Loadable<T>>;
export function mergeMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Empty>(state: S, mapper: (v: undefined) => ObservableInput<U>): OperatorFunction<Loadable<T>, U>;
export function mergeMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Loading>(state: S, mapper: (v: undefined) => ObservableInput<U>): OperatorFunction<Loadable<T>, U>;
export function mergeMapLoadable<T, U extends Loadable<any>, S extends LoadableState>(state: S, mapper: (v: any) => ObservableInput<U>): OperatorFunction<Loadable<T>, U|Loadable<T>> {
	return mergeMap(v => {
		if (v.state !== state) return of(v);
		if (v.isError()) return mapper(v.error);
		if (v.isLoaded()) return mapper(v.value);
		return mapper(undefined);
	})
}
export const mergeMapLoaded = mergeMapLoadable.Loaded =   <T, U extends Loadable<any>>(mapper: (v: T) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Loaded, mapper);
export const mergeMapError = mergeMapLoadable.Error =     <T, U extends Loadable<any>>(mapper: (v: ApiError) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Error, mapper);
export const mergeMapEmpty = mergeMapLoadable.Empty =     <T, U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Empty, mapper);
export const mergeMapLoading = mergeMapLoadable.Loading = <T, U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Loading, mapper);


/**
 * Like switchMap, but only call the mapper for Loadables of state S.
 * Other values are passed through.
 */
export function switchMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Loaded>(state: S, mapper: (v: T) => ObservableInput<U>): OperatorFunction<Loadable<T>, U>;
export function switchMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Error>(state: S, mapper: (v: ApiError) => ObservableInput<U>): OperatorFunction<Loadable<T>, U|Loadable<T>>;
export function switchMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Empty>(state: S, mapper: (v: undefined) => ObservableInput<U>): OperatorFunction<Loadable<T>, U>;
export function switchMapLoadable<T, U extends Loadable<any>, S extends LoadableState.Loading>(state: S, mapper: (v: undefined) => ObservableInput<U>): OperatorFunction<Loadable<T>, U>;
export function switchMapLoadable<T, U extends Loadable<any>, S extends LoadableState>(state: S, mapper: (v: any) => ObservableInput<U>): OperatorFunction<Loadable<T>, U|Loadable<T>> {
	return switchMap(v => {
		if (v.state !== state) return of(v);
		if (v.isError()) return mapper(v.error);
		if (v.isLoaded()) return mapper(v.value);
		return mapper(undefined);
	})
}
export const switchMapLoaded = switchMapLoadable.Loaded =   <T, U extends Loadable<any>>(mapper: (v: T) => ObservableInput<U>) => switchMapLoadable(LoadableState.Loaded, mapper);
export const switchMapError = switchMapLoadable.Error =     <T, U extends Loadable<any>>(mapper: (v: ApiError) => ObservableInput<U>) => switchMapLoadable(LoadableState.Error, mapper);
export const switchMapEmpty = switchMapLoadable.Empty =     <T, U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => switchMapLoadable(LoadableState.Empty, mapper);
export const switchMapLoading = switchMapLoadable.Loading = <T, U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => switchMapLoadable(LoadableState.Loading, mapper);


/**
 * Return a mapping function that converts an object into a Loaded<T> if all required keys are present and not null, and Empty otherwise.
 * When used without keys, it will return Loaded<T> if the object is not null, and Empty otherwise.
 * For use with streams.
 * ```
 * E.g. loadedIfNotNull()(null) -> Empty()
 * E.g. loadedIfNotNull()({a: 1, b: 2}) -> Loaded({a: 1, b: 2})
 * E.g. loadedIfNotNull('someProperty')(null) -> Empty()
 * E.g. LoadedIfNutNull('someProperty')({someProperty: 1}) -> Loaded({someProperty: 1})
 * E.g. LoadedIfNutNull('someProperty')({someProperty: undefined}) -> Empty()
 * ```
*/
export function loadedIfNotNull<T, K extends keyof T = keyof T>(...requiredKeys: K[]): (object: T) => Loadable<MarkRequiredAndNotNull<T, K>> {
	return (object: T): Loadable<MarkRequiredAndNotNull<T, K>> => {
		if (object == null) return Loadable.Empty();
		const isLoaded = requiredKeys.every(k => object[k] != null); // returns true for empty requiredKeys array
		return isLoaded ? Loadable.Loaded(object as MarkRequiredAndNotNull<T, K>) : Loadable.Empty();
	};
}

/**
 * Map the request/canceler into an observable that will emit loading states.
 * The observable will immediately emit a loading state.
 * If the request errors, the observable will emit a loading error state.
 * If the request completes successfully, the observable will emit a loaded state.
 * If the observable is unsubscribed, the request will be cancelled.
 * The observable will never error, but instead emit an error object.
 */
export const toObservable = <T>({cancel, request}: CancelableRequest<T>) => new Observable<Loadable<T>>(observer => {
	observer.next(Loadable.Loading());
	request
		.then(v => observer.next(Loadable.Loaded(v)))
		.catch((e: ApiError) => {
			if (!e.isCancelledRequest) observer.next(Loadable.LoadingError(e));
		})
		.finally(() => observer.complete());

	// When the observable is unsubscribed, cancel the request.
	return cancel; // cleanup for when the observable is unsubscribed.
});


/**
 * Unpack Observables and Loadables into their .value type.
 * E.g. Observable<Loadable<T>> -> T
 * E.g. Loadable<T> -> T
 * E.g. T -> T
 */
type ValueTypeFromLoadableOrObservable<T> = T extends Observable<infer U> ? L.Val<U> : L.Val<T>;
/**
 * Unpack Observables and Loadables into their .value type.
 * E.g. Observable<Loadable<T>> -> T|undefined
 * E.g. Loadable<T> -> T|undefined
 * E.g. T -> T
 */
type ValueTypeFromLoadableOrObservableIncludingEmpty<T> = T extends Observable<infer U> ? L.ValEmpty<U> : L.ValEmpty<T>;

export const compareAsSortedJson = <T1, T2>(a: T1, b: T2) => jsonStableStringify(a) === jsonStableStringify(b);

/**
 * Combine the values of a bunch of Loadables or other values into a single Loadable.
 * If any of the values are Loading, Empty, or Error, return that state instead.
 *
 * E.g. [Loaded<T>, {a: number}, Loaded<U>]       -> Loaded<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, LoadingError<U>] -> LoadingError<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Empty<U>]        -> Empty<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Loading<U>]      -> Loading<[T, {a: number}, U]>
 * E.g. {a: Loaded<T>, b: {a: number}, c: Loaded<U>} -> Loaded<{a: T, b: {a: number}, c: U}>
 */
export function combineLoadables<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: L.Val<T[K]> }> {
	const isUnloadedLoadable = (v: any): v is Loadable<any> => Loadable.isLoadable(v) && !Loadable.isLoaded(v);
	if (t == null) return Loadable.Empty();
	const loadingOrErrorOrEmpty: Loadable<any>|undefined = (Array.isArray(t) ? t : Object.values(t)).find(isUnloadedLoadable);
	if (loadingOrErrorOrEmpty) return loadingOrErrorOrEmpty;
	if (Array.isArray(t)) return Loadable.Loaded(t.map(v => Loadable.isLoaded(v) ? v.value : v) as any);
	else return Loadable.Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Loadable.isLoaded(v) ? v.value : v])) as any);
}
/**
 * Same as combineLoadables, but also includes Empty states. So if an Empty is present, this will return Loaded<undefined> instead of Empty.
 * E.g. [Loaded<T>, {a: number}, Empty<U>] -> Loaded<[T, {a: number}, undefined]>
 */
export function combineLoadablesIncludingEmpty<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: L.ValEmpty<T[K]> }> {
	if (t == null) return Loadable.Empty();
	const loadingOrError: Loadable<any>|undefined = (Array.isArray(t) ? t : Object.values(t)).find(v => Loadable.isLoadable(v) && !Loadable.isLoaded(v) && !Loadable.isEmpty(v));
	if (loadingOrError) return loadingOrError;
	if (Array.isArray(t)) return Loadable.Loaded((t).map(v => Loadable.isLoaded(v) ? v.value : Loadable.isEmpty(v) ? undefined : v) as any);
	else return Loadable.Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Loadable.isLoaded(v) ? v.value : Loadable.isEmpty(v) ? undefined : v])) as any);
}


const defaultInteractiveLoadableSettings = {
	/** How long old value is preserved when waiting for new values (in ms). < 0 means never. Defaults to -1*/
	delayClear: -1,
	/** Debounce inputs (in ms). <= 0 disables debouncing. Defaults to 1000. */
	debounce: 1000,
	/** Whether the last good value should be removed on errors. Defaults to true. */
	clearOnError: true,
}
type InteractiveLoadableSettings = typeof defaultInteractiveLoadableSettings;

/**
 * A class that behaves like a Loadable, but has a next() function that can be called to trigger the loading of a new value.
 * This can be useful when you don't want to use an Observable.
 * For example, in a Vue component:
 *
 * ```html
 * <div>
 * 	<div v-if="loadable.isLoading()">Loading...</div>
 * 	<div v-if="loadable.isLoaded()">Value: {{ loadable.value }}</div>
 * 	<div v-if="loadable.isError()">Error: {{ loadable.error }}</div>
 * </div>
 * ```
 * ```typescript
 * import { InteractiveLoadable } from '@/utils/loadable-streams';
 * export default {
 * 	data: () => ({
 * 		loadable: new InteractiveLoadable(map(i => Loaded(i + 1)))
 * 	}),
 * 	mounted() {
 * 		this.loadable.next(1);
 * 	},
 * 	beforeDestroy() {
 * 		this.loadable.dispose();
 * 	}
 * };
 * ```
 */
export class InteractiveLoadable<TInput, TOutput> extends Loadable<TOutput> {
	private readonly settings: InteractiveLoadableSettings;
	private readonly i$: Subject<TInput> = markRaw(new Subject());
	private readonly unsubs: Subscription[] = markRaw([]);

	constructor(processInput: (i$: Observable<TInput>) => Observable<Loadable<TOutput>>, settings?: Partial<InteractiveLoadableSettings>) {
		super(LoadableState.Empty, undefined, undefined);
		this.settings = markRaw({...defaultInteractiveLoadableSettings, ...settings})
		const debouncedInput$ = this.settings.debounce > 0 ? this.i$.pipe(debounceTime(this.settings.debounce)) : this.i$;
		const o$: Observable<Loadable<TOutput>> = processInput(debouncedInput$);

		const clear$ = this.i$.pipe(
			switchMap(() => ( // every time an input comes in:
				this.settings.delayClear < 0 ? EMPTY : // if we don't want to clear, no event is emitted
				this.settings.delayClear > 0 ? timer(this.settings.delayClear) :  // if we have a delay, emit an event after the delay
				of(0) // if clear === 0, emit an event immediately
			).pipe(takeUntil(o$))) // swallow the event if the output emits something (assuming that's the new value for the inpout)
		)

		this.unsubs.push(clear$.subscribe(() => this.value = this.error = undefined));
		this.unsubs.push(o$.subscribe({
			next: v => {
				this.state = v.state;
				if (!v.isLoading()) this.value = v.value;
				if (!v.isError()) this.error = v.error;
			},
			error: e => {
				this.state = LoadableState.Error;
				if (this.settings.clearOnError) this.value = undefined;
				this.error = new ApiError(
					e?.title || 'Unknown error',
					e?.message || 'Unknown error',
					e?.statusText || 'Unknown error',
					e?.httpCode ?? 0,
				)
			},
			complete: () => {
				this.state = LoadableState.Empty;
				this.value = undefined;
				this.error = undefined;
			}
		}));

		// Make this object reactive. NOTE: make sure to markRaw() all things that should not be reactive!
		// This means the streams and settings are not reactive, but the Loadable state + values are.
		Vue.observable(this);
	}

	public next(i: TInput) {
		this.i$.next(i);
	}

	public dispose() {
		this.unsubs.forEach(s => s.unsubscribe());
		this.unsubs.splice(0);
	}
}


/**
 * A class that behaves like a Loadable, auto-updates based on a stream's state.
 * This is basically a simple wrapper to go from async behavior to reactive behavior.
 * Don't forget to dispose() after you're done with it, or the stream will keep running.
 */
export class LoadableFromStream<T> extends Loadable<T> {
	private readonly unsubs: Subscription[] = markRaw([]);

	constructor(s$: Observable<T|Loadable<T>>, settings: {
		/** initial state is normally empty, but can be Loading if so desired. Defaults to false. */
		loadingOnStart?: boolean
		/** when stream finishes, can preserve or clear current state. Defaults to true. */
		keepValueAfterCompletion?: boolean;
	} = {loadingOnStart: false, keepValueAfterCompletion: true}) {
		super(settings.loadingOnStart ? LoadableState.Loading : LoadableState.Empty, undefined, undefined);
		this.unsubs.push(s$.subscribe({
			next: v => {
				if (Loadable.isLoadable(v)) {
					this.state = v.state;
					if (!v.isLoading()) this.value = v.value;
					this.error = v.error;
				} else {
					this.state = LoadableState.Loaded;
					this.value = v;
					this.error = undefined;
				}
			},
			error: e => {
				this.state = LoadableState.Error;
				this.value = undefined;
				this.error = new ApiError(
					e?.title || 'Unknown error',
					e?.message || 'Unknown error',
					e?.statusText || 'Unknown error',
					e?.httpCode ?? 0,
				)
			},
			complete: () => {
				if (settings.keepValueAfterCompletion) return;
				this.state = LoadableState.Empty;
				this.value = undefined;
				this.error = undefined;
			}
		}));

		// Make this object reactive. NOTE: make sure to markRaw() all things that should not be reactive!
		// This means the streams and settings are not reactive, but the Loadable state + values are.
		Vue.observable(this);
	}

	public dispose() {
		this.unsubs.forEach(s => s.unsubscribe());
		this.unsubs.splice(0);
	}
}


/**
 * Map the next non-loading state of the stream to a promise.
 * Empty<T> will resolve to undefined.
 * NOTE: if the stream returns a LoadingError<T>, this will reject!
 * Meaning that if you await this promise, it could throw!
 *
 * NOTE: if the stream caches values (such as with BehaviorSubject or shareReplay(1)),
 * the promise will resolve to the current value!
 * Make sure you next() the stream's input _before_ calling this function,
 * and make sure the stream's output changes synchronously with the input.
 * @param loadableStream
 * @returns a promise that will contain the first non-Loading state of the stream.
 */
export function promiseFromLoadableStream<T>(loadableStream: Observable<Loadable<T>>, title?: string): Promise<T|undefined> {
	return new Promise((resolve, reject) => loadableStream.pipe(
			filter(v => !v.isLoading()),
			take(1) // make sure we unsubscribe after the first non-loading state
		).subscribe({
			next: v => {
				if (v.isLoaded()) resolve(v.value);
				if (v.isError()) reject(v.error);
				if (v.isEmpty()) resolve(undefined);
			},
			error: reject,
			complete: () => resolve(undefined)
		})
	);
}

/**
 * Given a promise, return a stream that will emit Loading, Loaded, or LoadingError states.
 * @param promise
 * @returns
 */
export function loadableStreamFromPromise<T>(promise: Promise<T>): Observable<Loadable<T>> {
	const subject = new ReplaySubject<Loadable<T>>(1);
	subject.next(Loadable.Loading());
	promise
		.then(v => subject.next(Loadable.Loaded(v)))
		.catch(e => subject.next(Loadable.LoadingError(e)))
		.finally(() => subject.complete());
	return subject;
}

function combineLoadableStreamsImpl(combiner: typeof combineLoadables|typeof combineLoadablesIncludingEmpty, streams: Observable<any>[]|Record<string, Observable<any>>): Observable<Loadable<any>> {
	const combined$: Observable<Record<string, any>|any[]> = Array.isArray(streams)
		? combineLatest(streams)
		: combineLatest(streams as Record<string, Observable<any>>);

	return combined$.pipe(
		map(values => combiner(values)),
		distinctUntilChanged((prev, curr) => {
			if (prev.state !== curr.state) return false;
			if (prev.isLoaded() && curr.isLoaded()) return prev.value === curr.value;
			if (prev.isError() && curr.isError()) return prev.error === curr.error;
			return true; // both empty or both loading -> equal
		})
	);
}

/**
 * Like combineLoadables, but with streams.
 * Combine either a map of streams or an array of streams, and return a stream that will emit the latest values as a single loadable.
 * It will not emit repeated loading states.
 *
 * Might need 'as const' on argument to infer the types correctly.
 *
 * E.g.
 * ```
 * combineLoadableStreams([stream1, stream2, stream3]) -> stream emitting Loadable<[T1, T2, T3]>
 * combineLoadableStreams({a: stream1, b: stream2, c: stream3}) -> stream emitting Loadable<{a: T1, b: T2, c: T3}>
 * ```
 */
export function combineLoadableStreams<T extends readonly Observable<any>[]>(streams: T): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservable<T[K]> }>>;
export function combineLoadableStreams<T extends Record<string, Observable<any>>>(streams: T): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservable<T[K]> }>>;
export function combineLoadableStreams(streams: Observable<any>[]|Record<string, Observable<any>>): Observable<Loadable<any>> {
	return combineLoadableStreamsImpl(combineLoadables, streams);
}
/**
 * Like combineLoadablesIncludingEmpty, but with streams.
 * Combine either a map of streams or an array of streams, and return a stream that will emit the latest values as a single loadable.
 * It will not emit repeated loading states.
 *
 * Might need 'as const' on argument to infer the types correctly.
 *
 * E.g.
 * ```
 * combineLoadableStreamsIncludingEmpty([stream1, stream2, stream3]) -> stream emitting Loadable<[T1|undefined, T2|undefined, T3|undefined]>
 * combineLoadableStreamsIncludingEmpty({a: stream1, b: stream2, c: stream3}) -> stream emitting Loadable<{a: T1|undefined, b: T2|undefined, c: T3|undefined}>
 * ```
 */
export function combineLoadableStreamsIncludingEmpty<T extends readonly Observable<any>[]>(streams: T): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservableIncludingEmpty<T[K]>|undefined }>>;
export function combineLoadableStreamsIncludingEmpty<T extends Record<string, Observable<any>>>(streams: T): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservableIncludingEmpty<T[K]>|undefined }>>;
export function combineLoadableStreamsIncludingEmpty(streams: Observable<any>[]|Record<string, Observable<any>>): Observable<Loadable<any>> {
	return combineLoadableStreamsImpl(combineLoadablesIncludingEmpty, streams);
}
/**
 * Util: repeat last output when notifier$ emits anything.
 */
export function repeatLatestWhen<T>(notifier$: Observable<any>) {
	return (source: Observable<T>) => combineLatest([
		source,
		notifier$.pipe(startWith(null)),
	]).pipe(map(([val]) => val));
}