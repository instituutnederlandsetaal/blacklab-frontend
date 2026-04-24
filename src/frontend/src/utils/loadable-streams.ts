import { ApiError } from '@/types/apptypes';
import type { MarkRequiredAndNotNull } from '@/types/helpers';
import type { Canceler } from 'axios';
import jsonStableStringify from 'json-stable-stringify';
import type { InteropObservable, ObservableInput, ObservedValueOf, OperatorFunction, Subscription } from 'rxjs';
import { combineLatest, distinctUntilChanged, EMPTY, filter, map, mergeMap, Observable, of, ReplaySubject, startWith, Subject, switchMap, take, takeUntil, timer } from 'rxjs';
import { markRaw, onScopeDispose, reactive, shallowReactive, shallowRef } from 'vue';

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

const hasLoadableState = (v: any): v is { state: LoadableState } => v != null && typeof v === 'object' && 'state' in v;

export const isLoadable = <T>(v: any): v is Loadable<T> => v instanceof Loadable || (hasLoadableState(v) && (v.state === LoadableState.Loading || v.state === LoadableState.Loaded || v.state === LoadableState.Error || v.state === LoadableState.Empty)); // allow plain objects with a state to be considered loadables, for convenience.
export const isLoading = <T>(v: any): v is Loading<T> => v instanceof Loadable && v.isLoading() || (hasLoadableState(v) && v.state === LoadableState.Loading); // allow plain objects with state: 'loading' to be considered loading loadables, for convenience.
export const isLoaded = <T>(v: any): v is Loaded<T> => v instanceof Loadable && v.isLoaded() || (hasLoadableState(v) && v.state === LoadableState.Loaded); // allow plain objects with state: 'loaded' to be considered loaded loadables, for convenience. 
export const isError = <T>(v: any): v is LoadingError<T> => v instanceof Loadable && v.isError() || (hasLoadableState(v) && v.state === LoadableState.Error); // allow plain objects with state: 'error' to be considered error loadables, for convenience.
export const isEmpty = <T>(v: any): v is Empty<T> => v instanceof Loadable && v.isEmpty() || (hasLoadableState(v) && v.state === LoadableState.Empty); // allow plain objects with state: 'empty' to be considered empty loadables, for convenience.

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

	public static isLoadable = isLoadable;
	public static isLoading = isLoading;
	public static isLoaded = isLoaded;
	public static isError = isError;
	public static isEmpty = isEmpty;

	// default T to never, so it's removed when used in a conditional return:
	// e.g. `input ? Loadable.Loaded(doSomethingWith(input)) : Loadable.Empty()` would otherwise decay to Loadable<unknown> because the T for empty wasn't provided,
	// But this way, the T from empty is removed, and the T from loaded can be inferred from the value provided to loaded.
	// Making the return type the correct Loadable<T> instead of Loadable<unknown>.
	public static Loading<T = never>(): Loading<T> { return new Loadable<T>(LoadableState.Loading, undefined, undefined) as Loading<T>; }
	public static Loaded<T>(value: T): Loaded<T> { return new Loadable<T>(LoadableState.Loaded, value, undefined) as Loaded<T>; }
	public static LoadingError<T = never>(error: ApiError): LoadingError<T> { return new Loadable<T>(LoadableState.Error, undefined, error) as LoadingError<T>; }
	public static Empty<T = never>(): Empty<T> { return new Loadable<T>(LoadableState.Empty, undefined, undefined) as Empty<T>; }

	/** Return a loadable of the value, if the value is already a loadable, return it as is. Otherwise, wrap it in a Loaded loadable. */
	public static wrap<T, TV extends ValueTypeFromLoadableOrObservable<T>>(value: T): Loadable<TV> {
		if (Loadable.isLoadable<TV>(value)) return value;
		else return Loadable.Loaded<TV>(value as any);
	}
}

export class CancelableRequest<T> implements Promise<T>, InteropObservable<Loadable<T>> {
	public request: Promise<T>;
	public cancel: Canceler;
	constructor(request: Promise<T>, cancel: Canceler) {
		this.request = request;
		this.cancel = cancel;
	}

	get [Symbol.toStringTag]() { return 'CancelableRequest'; }

	public then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>)   | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>)   | null): CancelableRequest<TResult1 | TResult2> {
		return new CancelableRequest(this.request.then(onfulfilled, onrejected), this.cancel);
	}
	public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>)   | null): CancelableRequest<T | TResult> {
		return new CancelableRequest(this.request.catch(onrejected), this.cancel);
	}
	public finally(onfinally?: (() => void)   | null): CancelableRequest<T> {
		return new CancelableRequest(this.request.finally(onfinally), this.cancel);
	}

	public static isCancelableRequest<T>(value: any): value is CancelableRequest<T> {
		return value instanceof CancelableRequest;
	}

	public toObservable(): Observable<Loadable<T>> {
		return toObservable(this);
	}

	[Symbol.observable]() {
		return this.toObservable();
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
		T extends Empty<any> ? never :
		T extends LoadingError<any> ? never :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L :
		T;

	export type ValEmpty<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<unknown> ? undefined :
		T extends LoadingError<unknown> ? never :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L|undefined :
		T;

	export type ValError<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<unknown> ? never :
		T extends LoadingError<unknown> ? ApiError :
		// if we have a loadable with an unknown state, return the value
		T extends Loadable<infer L> ? L|ApiError :
		T;

	export type ValEmptyAndError<T> =
		// if we know the state, we can return the value directly
		T extends Loaded<infer L> ? L :
		T extends Loading<infer L> ? L :
		T extends Empty<unknown> ? undefined :
		T extends LoadingError<unknown> ? ApiError :
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
export const mapError = mapLoadable.Error = <U>(mapper: (v: ApiError) => U) => mapLoadable(LoadableState.Error, mapper);
export const mapEmpty = mapLoadable.Empty = <U>(mapper: (v: undefined) => U) => mapLoadable(LoadableState.Empty, mapper);
export const mapLoading = mapLoadable.Loading = <U>(mapper: (v: undefined) => U) => mapLoadable(LoadableState.Loading, mapper);

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
export const flatMapError = flatMapLoadable.Error =     <U extends Loadable<any>>(mapper: (v: ApiError) => U) => flatMapLoadable(LoadableState.Error, mapper);
export const flatMapEmpty = flatMapLoadable.Empty =     <U extends Loadable<any>>(mapper: (v: undefined) => U) => flatMapLoadable(LoadableState.Empty, mapper);
export const flatMapLoading = flatMapLoadable.Loading = <U extends Loadable<any>>(mapper: (v: undefined) => U) => flatMapLoadable(LoadableState.Loading, mapper);


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
export const mergeMapError = mergeMapLoadable.Error =     <U extends Loadable<any>>(mapper: (v: ApiError) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Error, mapper);
export const mergeMapEmpty = mergeMapLoadable.Empty =     <U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Empty, mapper);
export const mergeMapLoading = mergeMapLoadable.Loading = <U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => mergeMapLoadable(LoadableState.Loading, mapper);


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
export const switchMapError = switchMapLoadable.Error =     <U extends Loadable<any>>(mapper: (v: ApiError) => ObservableInput<U>) => switchMapLoadable(LoadableState.Error, mapper);
export const switchMapEmpty = switchMapLoadable.Empty =     <U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => switchMapLoadable(LoadableState.Empty, mapper);
export const switchMapLoading = switchMapLoadable.Loading = <U extends Loadable<any>>(mapper: (v: undefined) => ObservableInput<U>) => switchMapLoadable(LoadableState.Loading, mapper);


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
export function withRequiredKeys<T, K extends keyof T = keyof T>(...requiredKeys: K[]): (object: T) => Loadable<MarkRequiredAndNotNull<T, K>> {
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
			// A canceled request should not leave downstream combined streams in Loading forever.
			if (e?.isCancelledRequest) observer.next(Loadable.Empty());
			else observer.next(Loadable.LoadingError(e));
		})
		.finally(() => observer.complete());

	// When the observable is unsubscribed, cancel the request.
	return cancel; // cleanup for when the observable is unsubscribed.
});

/**
 * Unpack Observables and Loadables into their .value type.
 * If the static type of the Loadable is known (e.g. Empty<T>), return the statically known type (e.g. T for Loaded<T>, never for Empty<T> and LoadingError<T>).
 * 
 * @example ValueTypeFromLoadableOrObservable<Observable<Loadable<T>>> -> T
 * @example ValueTypeFromLoadableOrObservable<Loadable<T>> -> T
 * @example ValueTypeFromLoadableOrObservable<T> -> T
 */
type ValueTypeFromLoadableOrObservable<T> = L.Val<T extends ArrayLike<any> ? T : T extends ObservableInput<any> ? ObservedValueOf<T> : T>;
/**
 * Unpack Observables and Loadables into their .value type.
 * If the static type of the Loadable is known (e.g. Empty<T>), return the statically known type (e.g. T for Loaded<T>, never for Empty<T> and LoadingError<T>).
 * @example ValueTypeFromLoadableOrObservableIncludingEmpty<Observable<Loadable<T>>> -> T|undefined
 * @example ValueTypeFromLoadableOrObservableIncludingEmpty<Loadable<T>> -> T|undefined
 * @example ValueTypeFromLoadableOrObservableIncludingEmpty<T> -> T
 */
type ValueTypeFromLoadableOrObservableIncludingEmpty<T> = L.ValEmpty<T extends ArrayLike<any> ? T : T extends ObservableInput<any> ? ObservedValueOf<T> : T>;

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

type InteractiveLoadableSettings<TInput> = {
	/** How long old value is preserved when waiting for new values (in ms). < 0 means never. Defaults to -1 */
	delayClear: number;
	/** Debounce inputs (in ms). <= 0 disables debouncing. Defaults to 1000. */
	debounce: number|((input: TInput) => number);
	/** Whether the last good value should be removed on errors. Defaults to true. */
	clearOnError: boolean;
}
const defaultInteractiveLoadableSettings: InteractiveLoadableSettings<any> = {
	delayClear: -1,
	/** Debounce inputs (in ms). <= 0 disables debouncing. Defaults to 1000. */
	debounce: 1000,
	/** Whether the last good value should be removed on errors. Defaults to true. */
	clearOnError: true,
}

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
 * 	beforeUnmount() {
 * 		this.loadable.dispose();
 * 	}
 * };
 * ```
 */
export class InteractiveLoadable<TInput, TOutput> implements Loadable<TOutput> {
	private readonly i$: Subject<TInput> = markRaw(new Subject());
	private readonly unsubs: Subscription[] = markRaw([]);
	private readonly retry$ = markRaw(new Subject<void>());

	private readonly refs = markRaw({
		state: shallowRef(LoadableState.Empty),
		value: shallowRef<TOutput|undefined>(undefined),
		error: shallowRef<ApiError|undefined>(undefined)
	});

	constructor(processInput: (i$: Observable<TInput>) => Observable<Loadable<TOutput>>, settings?: Partial<InteractiveLoadableSettings<TInput>>) {
		const {debounce, delayClear, clearOnError} = {...defaultInteractiveLoadableSettings, ...settings};

		const debouncedInput$ = 
			typeof debounce === 'function' ? this.i$.pipe(switchMap(input => {
				const delay = debounce(input);
				return delay > 0 ? timer(delay).pipe(map(() => input)) : of(input);
			})) : 
			debounce > 0 ? this.i$.pipe(switchMap(input => timer(debounce).pipe(map(() => input)))) : 
			this.i$;

		const inputWithRetry$ = debouncedInput$.pipe(repeatLatestWhen(this.retry$));

		const o$: Observable<Loadable<TOutput>> = processInput(inputWithRetry$);

		const clear$ = this.i$.pipe(
			switchMap(() => ( // every time an input comes in:
				delayClear < 0 ? EMPTY : // if we don't want to clear, no event is emitted
				delayClear > 0 ? timer(delayClear) :  // if we have a delay, emit an event after the delay
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
				if (clearOnError) this.value = undefined;
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
	}
	public isLoading(): this is Loading<TOutput> { return Loadable.isLoading(this); }
	public isLoaded(): this is Loaded<TOutput> { return Loadable.isLoaded(this); }
	public isError(): this is LoadingError<TOutput> { return Loadable.isError(this); }
	public isEmpty(): this is Empty<TOutput> { return Loadable.isEmpty(this); }

	public next(i: TInput) {
		this.i$.next(i);
	}

	public retry() {
		this.retry$.next();
	}

	public dispose() {
		this.unsubs.forEach(s => s.unsubscribe());
		this.unsubs.splice(0);
	}
	public get state() { return this.refs.state.value; }
	public set state(v: LoadableState) { this.refs.state.value = v; }
	public get value() { return this.refs.value.value; }
	public set value(v: TOutput|undefined) { this.refs.value.value = v; }
	public get error() { return this.refs.error.value; }
	public set error(v: ApiError|undefined) { this.refs.error.value = v; }
}

export interface LoadableFromStream<T> extends Loadable<T> {
	dispose: () => void;
	toJSON(): {state: LoadableState, value: T|undefined, error: ApiError|undefined};
}

/** Helper for creating a reactive loadable */
class MutableLoadable<T> extends Loadable<T> implements LoadableFromStream<T>  {
	constructor(state: LoadableState, value: T|undefined, error: ApiError|undefined, public dispose: () => void) {
		super(state, value, error);
	}
	toJSON() {
		return {value: this.value, state: this.state, error: this.error};
	}
}

/**
 * A class that behaves like a Loadable, auto-updates based on a stream's state.
 * This is basically a simple wrapper to go from async behavior to reactive behavior.
 * 
 * When called from within a vue component, cleanup will happen automatically on unmount,
 * but otherwise, 
 * Don't forget to dispose() after you're done with it, or the stream will keep running.
 */
export function loadableFromStream<T>(
	stream$: Observable<T|Loadable<T>>, 
	settings: {
		/** initial state is normally empty, but can be Loading if so desired. Defaults to false. */
		loadingOnStart?: boolean
		/** when the stream completes, preserve settled Loaded/Error states or clear back to Empty. Loading is always cleared. Defaults to true. */
		keepValueAfterCompletion?: boolean;
		/** Defaults to false */
		deepReactiveValue?: boolean;
	} = {loadingOnStart: false, keepValueAfterCompletion: true, deepReactiveValue: false}
): MutableLoadable<ValueTypeFromLoadableOrObservable<T>> {
	settings = {loadingOnStart: false, keepValueAfterCompletion: true, deepReactiveValue: false, ...settings};
	let unsubs: Subscription[]|undefined = [];
	
	function onDispose() {
		unsubs?.forEach(s => s.unsubscribe());
		unsubs = undefined;
	}
	let l: MutableLoadable<ValueTypeFromLoadableOrObservable<T>> = new MutableLoadable<ValueTypeFromLoadableOrObservable<T>>(
		settings.loadingOnStart ? LoadableState.Loading : LoadableState.Empty,
		undefined, 
		undefined,
		onDispose
	);
	// TODO: Need to figure this out
	// @ts-expect-error ugh, reactive(l) somehow turns l.value into UnwrapRef<...> which makes typescript complain
	if (settings.deepReactiveValue) l = reactive(l); else l = shallowReactive(l);

	// tear down streams automatically if this is called from within a reactive context
	// otherwise the caller has to call dispose() manually when they're done with it.
	onScopeDispose(onDispose);
	
	unsubs.push(stream$.subscribe({
		next: nextState => Object.assign(l, Loadable.wrap(nextState)),
		error: e => Object.assign(l, Loadable.LoadingError(ApiError.wrap(e))),
		complete: () => {
			if (settings.keepValueAfterCompletion && !l.isLoading()) return;
			Object.assign(l, Loadable.Empty());
		}
	}));

	return l;
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

function combineLoadableStreamsImpl(combiner: typeof combineLoadables|typeof combineLoadablesIncludingEmpty, streams: ObservableInput<any>[]|Record<string, ObservableInput<any>>): Observable<Loadable<any>> {
	const combined$: ObservableInput<Record<string, any>|any[]> = Array.isArray(streams)
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
 * Combine streams of loadables, and return a stream that will emits the combined values as a single loadable.
 * Like combineLoadablesIncludingEmpty, but with streams.
 * It will not emit repeated loading states.
 *
 * Might need 'as const' on argument to infer the types correctly.
 *
 * All inputs Loading -> output Loading<br>
 * Any input Error -> output Error, ignore Loaded, Empty, Loading inputs<br>
 * Any input Loaded -> Loaded with the value of all Loaded inputs, and undefined for Empty inputs.<br>
 * All inputs Empty -> output Empty<br>
 * 
 * E.g.
 * ```
 * combineLoadableStreamsIncludingEmpty([stream1, stream2, stream3]) -> stream emitting Loadable<[T1|undefined, T2|undefined, T3|undefined]>
 * combineLoadableStreamsIncludingEmpty({a: stream1, b: stream2, c: stream3}) -> stream emitting Loadable<{a: T1|undefined, b: T2|undefined, c: T3|undefined}>
 * ```
 * 
 * If you only need the settled values and want to skip partially loaded states, use {@link combineLoadableStreams} instead.
 */
export function combineLoadableStreamsIncludingEmpty<T extends readonly ObservableInput<any>[]>(streams: T): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservableIncludingEmpty<T[K]> }>>;
export function combineLoadableStreamsIncludingEmpty<T extends Record<string, ObservableInput<any>>>(streams: T): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservableIncludingEmpty<T[K]> }>>;
export function combineLoadableStreamsIncludingEmpty(streams: ObservableInput<any>[]|Record<string, ObservableInput<any>>): Observable<Loadable<any>> {
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

export const EMPTY_LOADABLE = Loadable.Empty();
export const EMPTY_LOADABLE_STREAM = of(EMPTY_LOADABLE);