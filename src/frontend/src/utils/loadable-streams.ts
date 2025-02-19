import { combineLatest, debounceTime, delay, distinctUntilChanged, EMPTY, filter, firstValueFrom, map, mergeMap, Observable, ObservableInput, of, OperatorFunction, pipe, ReplaySubject, startWith, Subject, Subscription, switchMap, tap, timer } from 'rxjs';
import jsonStableStringify from 'json-stable-stringify';
import { ApiError, Canceler } from '@/api';
import { CancelableRequest } from '@/api/apiutils';
import { MarkRequiredAndNotNull } from '@/types/helpers';
import Vue from 'vue';


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
 *   map<string, CancelableRequest<T>(url => api.get(url)),
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

/**
 * Given a type of Loadable<T>, return a Loadable<U>. Do it in such a way that the loading state is preserved if it is statically known.
 * E.g. Loaded<T> -> Loaded<U>, Empty<T> -> Empty<U> etc.
 */
type ReplaceLoadableGeneric<T extends Loadable<any>, U> =
	T extends Loaded<any> ? Loaded<U> :
	T extends LoadingError<any> ? LoadingError<U> :
	T extends Loading<any> ? Loading<U> :
	T extends Empty<any> ? Empty<U> :
	T extends Loadable<any> ? Loadable<U> :
	never;

/** Map a Loadable representing the loaded value into a Loadable containing anything else. */
export function mapLoaded<T extends Loadable<any>, U>(mapper: (v: T extends Loadable<infer V> ? V : never) => U): OperatorFunction<T, ReplaceLoadableGeneric<T, U>> {
	return map(v => Loadable.isLoaded(v) ? Loadable.Loaded(mapper(v.value)) : v as any);
}
/** Map a Loadable representing an error into a Loadable containing anything else. */
export function mapError<T extends U, U>(mapper: (v: ApiError) => Loadable<U>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => Loadable.isError(v) ? mapper(v.error) : v);
}
/** Map a Loadable representing the loaded value into a Loadable containing anything else, asynchronously. */
export function mergeMapLoaded<T, U>(mapper: (v: T) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return mergeMap(v => Loadable.isLoaded<T>(v) ? mapper(v.value) : of(v as any));
}
/** Map a Loadable representing an error into into a Loadable containing anything else, asynchronously. */
export function mergeMapError<T extends U, U>(mapper: (v: ApiError) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return mergeMap(v => Loadable.isError(v) ? mapper(v.error) : of(v));
}
export function switchMapLoaded<T, U>(mapper: (v: T) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return switchMap(v => Loadable.isLoaded<T>(v) ? mapper(v.value) : of(v as any));
}
export function switchMapError<T extends U, U>(mapper: (v: ApiError) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return switchMap(v => Loadable.isError(v) ? mapper(v.error) : of(v));
}

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
export function loadedIfNotNull<T, K extends keyof T = never>(...requiredKeys: K[]): (object: T) => Loadable<MarkRequiredAndNotNull<T, K>> {
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
	request.then(v => {
		observer.next(Loadable.Loaded(v));
		observer.complete();
	}).catch((e: ApiError) => {
		if (e.title !== 'Request cancelled')
			observer.next(Loadable.LoadingError(e));
		observer.complete();
	});
	// When the observable is unsubscribed, cancel the request.
	return function onUnsubscribe() { cancel(); }
});

/**
 * Given a Loadable<T>, return the T type. If the Loading state is statically known, return the statically known type of the .value.
 */
type ValueFromLoadableIncludingEmpty<T> =
// if we know the state, we can return the value directly
T extends Loaded<infer L> ? L :
T extends LoadingError<infer L> ? never :
T extends Empty<infer L> ? undefined :
T extends Loading<infer L> ? L :
// if we have a loadable with an unknown state, return the value
T extends Loadable<infer L> ? L|undefined :
T;

/** Given a Loadable<T>, return the T type. If the Loading state is statically known, return the statically known type of the .value */
type ValueFromLoadable<T> =
T extends Loaded<infer L> ? L :
T extends LoadingError<infer L> ? never :
T extends Empty<infer L> ? never :
T extends Loading<infer L> ? L :
T extends Loadable<infer L> ? L :
T;

/**
 * Unpack Observables and Loadables into their .value type.
 * E.g. Observable<Loadable<T>> -> T
 * E.g. Loadable<T> -> T
 * E.g. T -> T
 */
type ValueTypeFromLoadableOrObservable<T> = T extends Observable<infer U> ? ValueFromLoadable<U> : ValueFromLoadable<T>;
/**
 * Unpack Observables and Loadables into their .value type.
 * E.g. Observable<Loadable<T>> -> T|undefined
 * E.g. Loadable<T> -> T|undefined
 * E.g. T -> T
 */
type ValueTypeFromLoadableOrObservableIncludingEmpty<T> = T extends Observable<infer U> ? ValueFromLoadableIncludingEmpty<U> : ValueFromLoadableIncludingEmpty<T>;

/**
 * <pre>
 * Given an observable (potentially of Loadables),
 * return a Loadable that mirrors the observable, except with the value of the observable.
 * Basically, if the observable emits a value, the loadable will have its state and value set to that value.
 * If the observable completes, the loadable will keep its last value
 * If the observable errors, the loadable will have its state set to error.
 *
 * If the stream outputs loadables itself, those are mirrored.
 *
 * So:
 * Observable<Loadable<T>> -> Loadable<T>
 * Observable<T> -> Loadable<T>
 */
export function loadableFromObservable<
	T extends Observable<any>,
	R extends ValueTypeFromLoadableOrObservable<T>
>(obs: T, subs: Subscription[], initialValue?: Loadable<R>): Loadable<R> {
	const ret: Loadable<R> = initialValue ?? Loadable.Empty();
	const unsub = obs.subscribe({
		next: v => Object.assign(ret, v instanceof Loadable ? v : Loadable.Loaded(v)),
		error: e => Object.assign(ret, Loadable.LoadingError(e)),
		complete: () => {
			if (ret.state === LoadableState.Loading) {
				Object.assign(ret, Loadable.Empty());
				return;
			}
			// else keep current value.
		}
	});
	subs.push(unsub);
	return ret;
}

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
export function combineLoadables<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: ValueFromLoadable<T[K]> }> {
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
export function combineLoadablesIncludingEmpty<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: ValueFromLoadableIncludingEmpty<T[K]> }> {
	if (t == null) return Loadable.Empty();
	const loadingOrError: Loadable<any>|undefined = (Array.isArray(t) ? t : Object.values(t)).find(v => Loadable.isLoadable(v) && !Loadable.isLoaded(v) && !Loadable.isEmpty(v));
	if (loadingOrError) return loadingOrError;
	if (Array.isArray(t)) return Loadable.Loaded((t).map(v => Loadable.isLoaded(v) ? v.value : Loadable.isEmpty(v) ? undefined : v) as any);
	else return Loadable.Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Loadable.isLoaded(v) ? v.value : Loadable.isEmpty(v) ? undefined : v])) as any);
}

// some sanity checks
(() => {
	const apiError: ApiError = {httpCode: 0, message: '', name: '', statusText: '', title: ''};
	const loading = Loadable.Loading();
	const loaded = Loadable.Loaded(1);
	const error = Loadable.LoadingError(apiError);
	const empty = Loadable.Empty();

	const alertAndLog = (msg: string) => { alert(msg); console.error(new Error(msg)); };

	if (!Loadable.isLoadable(loading)) alertAndLog('isLoadable failed');
	if (!Loadable.isLoadable(loaded)) alertAndLog('isLoadable failed');
	if (!Loadable.isLoadable(error)) alertAndLog('isLoadable failed');
	if (!Loadable.isLoadable(empty)) alertAndLog('isLoadable failed');
	if (!loading.isLoading()) alertAndLog('isLoading failed');
	if (!loaded.isLoaded()) alertAndLog('isLoaded failed');
	if (!error.isError()) alertAndLog('isError failed');
	if (!empty.isEmpty()) alertAndLog('isEmpty failed');

	const combined = combineLoadables([loaded, {a: 2}, loaded] as const);
	if (!combined.isLoaded()) { alertAndLog('combineLoadables failed'); return; }
	if (combined.value[0] !== 1) alertAndLog('combineLoadables failed');
	if (combined.value[1].a !== 2) alertAndLog('combineLoadables failed');
	if (combined.value[2] !== 1) alertAndLog('combineLoadables failed');
	if (!Loadable.isLoadable(combined)) alertAndLog('combineLoadables failed');
	const toCombine = {a: loaded, b: {a: 2}, c: loaded};
	const combinedObj = combineLoadables(toCombine);
	if (!combinedObj.isLoaded()) { alertAndLog('combineLoadables with object failed'); return; }
	if (combinedObj.value.a !== 1) alertAndLog('combineLoadables with object failed');
	if (combinedObj.value.b.a !== 2) alertAndLog('combineLoadables with object failed');
	if (combinedObj.value.c !== 1) alertAndLog('combineLoadables with object failed');
	if (!Loadable.isLoadable(combinedObj)) alertAndLog('combineLoadables with object failed');
})();


type InteractiveLoadableSettings = {
	/** Add a delay before showing loading state.
	 * Values below 0 will never set loading state, instead just silently update value and state (other than loading state). */
	delayLoading: number,
	/** Delay clearing previous values and/or errors when loading has taken more that this many ms. Values below 0 will never clear the previous value. */
	delayClear: number,
	/** Values below 0 will not debounce */
	debounce: number,
	/** Remove the current value on errors? Only has an effect when delayClear !== 0 */
	clearOnError: boolean,
}

function markRaw(t: any) { return t; }

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
	private readonly settings: InteractiveLoadableSettings = markRaw({delayLoading: 1000, delayClear: -1, debounce: -1, clearOnError: true});
	private readonly i$: Subject<TInput> = markRaw(new Subject());
	private readonly unsubs: Subscription[] = markRaw([]);

	constructor(processInput: (i$: Observable<TInput>) => Observable<Loadable<TOutput>>, settings?: Partial<InteractiveLoadableSettings>) {
		super(LoadableState.Empty, undefined, undefined);
		if (settings) Object.assign(this.settings, settings);

		const debouncedInput$ = this.settings.debounce > 0 ? this.i$.pipe(debounceTime(this.settings.debounce)) : this.i$;
		const o$: Observable<Loadable<TOutput>> = processInput(debouncedInput$);

		this.unsubs.push(o$.subscribe({
			next: v => {
				this.state = v.state;
				if (!v.isLoading()) this.value = v.value;
				if (!v.isError()) this.error = v.error;
			},
			error: e => {
				this.state = LoadableState.Error;
				if (this.settings.clearOnError) this.value = undefined;
				this.error = {
					httpCode: 0,
					message: e.message? e.message : 'Unknown error',
					name: e.name ? e.name : 'Unknown error',
					statusText: '',
					title: 'Unknown error'
				}
			},
			complete: () => {
				this.state = LoadableState.Empty;
				this.value = undefined;
				this.error = undefined;
			}
		}));
		if (this.settings.delayClear >= 0) {
			const clear$ = o$.pipe(switchMap(e => e.isLoading() ? timer(this.settings.delayClear) : EMPTY));
			this.unsubs.push(clear$.subscribe(() => this.value = this.error = undefined));
		}

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
	return new Promise((resolve, reject) => {
		const sub = loadableStream.pipe(
			filter(v => !v.isLoading()),
			tap(v => console.log('promiseFromLoadableStream', title, v)),
		).subscribe({
			next: v => {
				if (v.isLoaded()) resolve(v.value);
				if (v.isError()) reject(v.error);
				if (v.isEmpty()) resolve(undefined);
			},
			error: e => reject(e),
			complete: () => resolve(undefined)
		});
	});
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
 * combineLoadableStreams([stream1, stream2, stream3]) -> stream emitting Loadable<[T1, T2, T3]>
 * combineLoadableStreams({a: stream1, b: stream2, c: stream3}) -> stream emitting Loadable<{a: T1, b: T2, c: T3}>
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
 * combineLoadableStreamsIncludingEmpty([stream1, stream2, stream3]) -> stream emitting Loadable<[T1|undefined, T2|undefined, T3|undefined]>
 * combineLoadableStreamsIncludingEmpty({a: stream1, b: stream2, c: stream3}) -> stream emitting Loadable<{a: T1|undefined, b: T2|undefined, c: T3|undefined}>
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