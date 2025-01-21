import { combineLatest, distinctUntilChanged, filter, firstValueFrom, map, mergeMap, Observable, ObservableInput, of, OperatorFunction, pipe, ReplaySubject, startWith, Subscription, switchMap } from 'rxjs';
import jsonStableStringify from 'json-stable-stringify';
import { ApiError, Canceler } from '@/api';
import { CancelableRequest } from '@/api/apiutils';
import { MarkRequiredAndNotNull } from '@/types/helpers';


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

export abstract class Loadable<T> {
	protected constructor(public state: LoadableState) {}

	public isLoading(): this is Loading<T> { return this.state === LoadableState.Loading; }
	public isLoaded(): this is Loaded<T> { return this.state === LoadableState.Loaded; }
	public isError(): this is LoadingError<T> { return this.state === LoadableState.Error; }
	public isEmpty(): this is Empty<T> { return this.state === LoadableState.Empty; }

	public static isLoadable<T>(v: any): v is Loadable<T> { return v instanceof Loadable; }
	public static isLoading<T>(v: any): v is Loading<T> { return v instanceof Loadable && v.isLoading(); }
	public static isLoaded<T>(v: any): v is Loaded<T> { return v instanceof Loadable && v.isLoaded(); }
	public static isError<T>(v: any): v is LoadingError<T> { return v instanceof Loadable && v.isError(); }
	public static isEmpty<T>(v: any): v is Empty<T> { return v instanceof Loadable && v.isEmpty(); }

	public static Loading<T>(): Loading<T> { return new Loading<T>(); }
	public static Loaded<T>(value: T): Loaded<T> { return new Loaded<T>(value); }
	public static LoadingError<T>(error: ApiError): LoadingError<T> { return new LoadingError(error); }
	public static Empty<T>(): Empty<T> { return new Empty(); }
}

class Loading<T> extends Loadable<T> {
	constructor() { super(LoadableState.Loading); }
	get value(): undefined { return undefined; }
	get error(): undefined { return undefined; }
}

class Empty<T> extends Loadable<T> {
	constructor() { super(LoadableState.Empty); }
	get value(): undefined { return undefined; }
	get error(): undefined { return undefined; }
}

class Loaded<T> extends Loadable<T> {
	constructor(public value: T) { super(LoadableState.Loaded); }
	get error(): undefined { return undefined; }
}

class LoadingError<T> extends Loadable<T> {
	constructor(public error: ApiError) { super(LoadableState.Error); }
	get value(): undefined { return undefined; }
}

/** Map a Loadable representing the loaded value into one that can be anything else. */
export function mapLoaded<T, U>(mapper: (v: T) => U): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => v.isLoaded() ? new Loaded(mapper(v.value)) : v as any);
}
/** Map a Loadable representing an error into one that can be anything else. */
export function mapError<T extends U, U>(mapper: (v: ApiError) => Loadable<U>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => v.isError() ? mapper(v.error) : v);
}
/** Map a Loadable representing the loaded value into one that can be anything else, asynchronously. */
export function mergeMapLoaded<T, U>(mapper: (v: T) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return mergeMap(v => v.isLoaded() ? mapper(v.value) : of(v as any));
}
/** Map a Loadable representing an error into one that can be anything else, asynchronously. */
export function mergeMapError<T extends U, U>(mapper: (v: ApiError) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return mergeMap(v => v.isError() ? mapper(v.error) : of(v));
}
export function switchMapLoaded<T, U>(mapper: (v: T) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return switchMap(v => v.isLoaded() ? mapper(v.value) : of(v as any));
}
export function switchMapError<T extends U, U>(mapper: (v: ApiError) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return switchMap(v => v.isError() ? mapper(v.error) : of(v));
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
		if (object == null) return new Empty();
		const isLoaded = requiredKeys.every(k => object[k] != null); // returns true for empty requiredKeys array
		return isLoaded ? new Loaded(object as MarkRequiredAndNotNull<T, K>) : new Empty();
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
	observer.next(new Loading());
	request.then(v => {
		observer.next(new Loaded(v));
		observer.complete();
	}).catch((e: ApiError) => {
		if (e.title !== 'Request cancelled')
			observer.next(new LoadingError(e));
		observer.complete();
	});
	// When the observable is unsubscribed, cancel the request.
	return function onUnsubscribe() { cancel(); }
});

type TemplateTypeFromLoadableOrObservable<T> =
	T extends Observable<infer U> ? U extends Loadable<infer L> ? L : U :
	T extends Loadable<infer U> ? U : T;

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
	R extends TemplateTypeFromLoadableOrObservable<T>
>(obs: T, subs: Subscription[], initialValue?: Loadable<R>): Loadable<R> {
	const ret: Loadable<R> = initialValue ?? new Empty();
	const unsub = obs.subscribe({
		next: v => Object.assign(ret, v instanceof Loadable ? v : new Loaded(v)),
		error: e => Object.assign(ret, new LoadingError(e)),
		complete: () => {
			if (ret.state === LoadableState.Loading) {
				Object.assign(ret, new Empty());
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
 * Given an array of objects and/or loadables, return a type with the same object, except with loadables replaced by their T type
 * E.g. [Loadable<T>, {a: number}, Loadable<U>] -> [T, {a: number}, U]
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

type ValueFromLoadable<T> =
T extends Loaded<infer L> ? L :
T extends LoadingError<infer L> ? never :
T extends Empty<infer L> ? never :
T extends Loading<infer L> ? L :
T extends Loadable<infer L> ? L :
T;

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
	if (t == null) return new Empty();
	const loadingOrErrorOrEmpty = Array.isArray(t) ? t.find(v => v instanceof Loadable && !v.isLoaded()) : Object.values(t ?? {}).find(v => v instanceof Loadable && !v.isLoaded());
	if (loadingOrErrorOrEmpty) return loadingOrErrorOrEmpty;
	if (Array.isArray(t)) return new Loaded(t.map(v => v.isLoaded() ? v.value : v) as any);
	else return new Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, (v instanceof Loadable && v.isLoaded()) ? v.value : v])) as any);
}
/**
 * Same as combineLoadables, but also includes Empty states. So if an Empty is present, this will return Loaded<undefined> instead of Empty.
 * E.g. [Loaded<T>, {a: number}, Empty<U>] -> Loaded<[T, {a: number}, undefined]>
 */
export function combineLoadablesIncludingEmpty<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: ValueFromLoadableIncludingEmpty<T[K]> }> {
	if (t == null) return new Empty();
	const loadingOrError = Array.isArray(t) ? t.find(v => Loadable.isLoadable(v) && !v.isLoaded() && !v.isEmpty()) : Object.values(t ?? {}).find(v => Loadable.isLoadable(v) && !v.isLoaded() && !v.isEmpty());
	if (loadingOrError) return loadingOrError;
	if (Array.isArray(t)) return new Loaded((t).map(v => v.isLoaded() ? v.value : v.isEmpty() ? undefined : v) as any);
	else return new Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.isLoaded() ? v.value : v.isEmpty() ? undefined : v])) as any);
}

// some sanity checks
(() => {
	const apiError: ApiError = {httpCode: 0, message: '', name: '', statusText: '', title: ''};
	const loading = new Loading();
	const loaded = new Loaded(1);
	const error = new LoadingError(apiError);
	const empty = new Empty();

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
 * 		loadable: new InteractiveLoadable(i$ => i$.pipe(map(i => Loaded(i + 1))))
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
export class InteractiveLoadable<I, T> extends Loadable<T> {
	private i$: ReplaySubject<I> = new ReplaySubject(1);
	private o$: Observable<Loadable<T>>;
	private unsub: Subscription;
	private _error: ApiError|undefined;
	private _value: T|undefined;

	constructor(processInput: (i$: Observable<I>) => Observable<Loadable<T>>) {
		super(LoadableState.Empty);

		this.o$ = processInput(this.i$);
		this.unsub = this.o$.subscribe({
			next: v => {
				this.state = v.state;
				this._value = v.isLoaded() ? v.value : undefined;
				this._error = v.isError() ? v.error : undefined;
			},
			error: e => {
				this.state = LoadableState.Error;
				this._value = undefined;
				this._error = {
					httpCode: 0,
					message: e.message? e.message : 'Unknown error',
					name: e.name ? e.name : 'Unknown error',
					statusText: '',
					title: 'Unknown error'
				}
			},
			complete: () => {
				this.state = LoadableState.Empty;
				this._value = undefined;
				this._error = undefined;
			}
		});
	}

	public next(i: I) {
		this.i$.next(i);
	}

	public dispose() {
		this.unsub.unsubscribe();
	}

	public get error() { return this._error; }
	public get value() { return this._value; }
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
export function promiseFromLoadableStream<T>(loadableStream: Observable<Loadable<T>>): Promise<T|undefined> {
	return new Promise((resolve, reject) => {
		const sub = loadableStream.pipe(filter(v => !v.isLoading())).subscribe({
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
	subject.next(new Loading());
	promise.then(v => subject.next(new Loaded(v))).catch(e => subject.next(new LoadingError(e))).finally(() => subject.complete());
	return subject;
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
export function combineLoadableStreams<T extends readonly Observable<any>[]>(streams: T): Observable<Loadable<{ [K in keyof T]: TemplateTypeFromLoadableOrObservable<T[K]> }>>;
export function combineLoadableStreams<T extends Record<string, Observable<any>>>(streams: T): Observable<Loadable<{ [K in keyof T]: TemplateTypeFromLoadableOrObservable<T[K]> }>>;
export function combineLoadableStreams(streams: Observable<any>[]|Record<string, Observable<any>>): Observable<Loadable<any>> {
	const combined$: Observable<Record<string, any>|any[]> = Array.isArray(streams)
		? combineLatest(streams)
		: combineLatest(streams as Record<string, Observable<any>>);

	return combined$.pipe(
		map(values => combineLoadables(values)),
		distinctUntilChanged((prev, curr) => {
			if (prev.state !== curr.state) return false;
			if (prev.isLoaded() && curr.isLoaded()) return prev.value === curr.value;
			if (prev.isError() && curr.isError()) return prev.error === curr.error;
			return true; // both empty or both loading -> equal
		})
	);
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