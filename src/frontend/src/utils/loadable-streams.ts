import { combineLatest, distinctUntilChanged, filter, firstValueFrom, map, mergeMap, Observable, ObservableInput, of, OperatorFunction, pipe, ReplaySubject, startWith, Subscription, switchMap } from 'rxjs';
import jsonStableStringify from 'json-stable-stringify';
import { ApiError, Canceler } from '@/api';
import { CancelableRequest } from '@/api/apiutils';

export enum LoadableState {
	Loading = 'loading',
	Loaded = 'loaded',
	Error = 'error',
	Empty = 'empty'
}

export type Loading<T> =      {state: LoadableState.Loading, value?: undefined, error?: undefined};
export type Loaded<T> =       {state: LoadableState.Loaded,  value:  T,         error?: undefined};
export type LoadingError<T> = {state: LoadableState.Error,   value?: undefined, error:  ApiError};
export type Empty<T> =        {state: LoadableState.Empty,   value?: undefined, error?: undefined};
export type Loadable<T> =     Loading<T> | Loaded<T> | LoadingError<T> | Empty<T>;

export const Loading = <T>(): Loading<T> =>       ({state: LoadableState.Loading, value: undefined, error: undefined});
export const Loaded = <T>(value: T): Loaded<T> => ({state: LoadableState.Loaded,  value, error: undefined});
export const LoadingError = <T>(error: ApiError): LoadingError<T> => ({state: LoadableState.Error, value: undefined, error});
export const Empty = <T>(): Empty<T> => ({state: LoadableState.Empty, value: undefined, error: undefined});

export const isLoadable = <T>(v: any): v is Loadable<T> => {
	if (!v || typeof v !== 'object' || !('state' in v)) return false;
	if (!Object.values(LoadableState).includes(v.state)) return false;
	if (v.state !== LoadableState.Loaded && v.value !== undefined) return false;
	if (v.state !== LoadableState.Error && v.error !== undefined) return false;
	return true;
};
export const isLoaded = <T>(v: Loadable<T>): v is Loaded<T> => v.state === LoadableState.Loaded;
export const isLoading = <T>(v: Loadable<T>): v is Loading<T> => v.state === LoadableState.Loading;
export const isError = <T>(v: Loadable<T>): v is LoadingError<T> => v.state === LoadableState.Error;
export const isEmpty = <T>(v: Loadable<T>): v is Empty<T> => v.state === LoadableState.Empty;

/** Map a Loadable representing the loaded value into one that can be anything else. */
export function mapLoaded<T, U>(mapper: (v: T) => U): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => isLoaded(v) ? Loaded(mapper(v.value)) : v);
}
/** Map a Loadable representing an error into one that can be anything else. */
export function mapError<T extends U, U>(mapper: (v: ApiError) => Loadable<U>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => isError(v) ? mapper(v.error) : v);
}

/** Map a Loadable representing the loaded value into one that can be anything else, asynchronously. */
export function mergeMapLoaded<T, U>(mapper: (v: T) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return mergeMap(v => isLoaded(v) ? mapper(v.value) : of(v));
}
/** Map a Loadable representing an error into one that can be anything else, asynchronously. */
export function mergeMapError<T extends U, U>(mapper: (v: ApiError) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return mergeMap(v => isError(v) ? mapper(v.error) : of(v));
}

export function switchMapLoaded<T, U>(mapper: (v: T) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return switchMap(v => isLoaded(v) ? mapper(v.value) : of(v));
}
export function switchMapError<T extends U, U>(mapper: (v: ApiError) => ObservableInput<Loadable<U>>): OperatorFunction<Loadable<T>, Loadable<U>> {
	return switchMap(v => isError(v) ? mapper(v.error) : of(v));
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
	observer.next(Loading());
	request.then(v => {
		observer.next(Loaded(v));
		observer.complete();
	}).catch((e: ApiError) => {
		if (e.title !== 'Request cancelled')
			observer.next(LoadingError(e));
		observer.complete();
	});
	return () => cancel();
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
	const ret: Loadable<R> = initialValue ? {...initialValue} : Empty();
	const unsub = obs.subscribe({
		next: v => Object.assign(ret, isLoadable(v) ? v : Loaded(v)),
		error: e => Object.assign(ret, LoadingError(e)),
		complete: () => {
			if (ret.state === LoadableState.Loading) {
				Object.assign(ret, Empty());
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
 * Given an Array or object, unpack all loadables within it, and return a Loadable with the same structure, except with loadables replaced by their value.
 * If any of the loadables are loading, empty, or errored, return that state instead.
 * Basically, if everything is loaded, return a loadable holding the value, otherwise return the reason we can't return the value.
 *
 * E.g. [Loaded<T>, {a: number}, Loaded<U>]       -> Loaded<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, LoadingError<U>] -> LoadingError<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Empty<U>]        -> Empty<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Loading<U>]      -> Loading<[T, {a: number}, U]>
 * E.g. {a: Loaded<T>, b: {a: number}, c: Loaded<U>} -> Loaded<{a: T, b: {a: number}, c: U}>
 */
export function combineLoadables<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: ValueFromLoadable<T[K]> }> {
	if (t == null) return Empty();
	const loadingOrErrorOrEmpty = Array.isArray(t) ? t.find(v => isLoadable(v) && !isLoaded(v)) : Object.values(t ?? {}).find(v => isLoadable(v) && !isLoaded(v));
	if (loadingOrErrorOrEmpty) return loadingOrErrorOrEmpty;
	if (Array.isArray(t)) return Loaded((t).map(v => isLoaded(v) ? v.value : v) as any);
	else return Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, isLoaded(v) ? v.value : v])) as any);
}
/**
 * Given an Array or object, unpack all loadables within it, and return a Loadable with the same structure, except with loadables replaced by their value.
 * If any of the loadables are loading or errored, return that state instead.
 * Basically, if everything is loaded/empty, return a loadable holding the value, otherwise return the reason we can't return the value.
 *
 * E.g. [Loaded<T>, {a: number}, Loaded<U>]       -> Loaded<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, LoadingError<U>] -> LoadingError<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Empty<U>]        -> Loaded<[T, {a: number}, undefined]> -- note the difference with combineLoadables here.
 * E.g. [Loaded<T>, {a: number}, Loading<U>]      -> Loading<[T, {a: number}, U]>
 * E.g. {a: Loaded<T>, b: {a: number}, c: Loaded<U>} -> Loaded<{a: T, b: {a: number}, c: U}>
 */
export function combineLoadablesIncludingEmpty<T extends readonly any[]|Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: ValueFromLoadableIncludingEmpty<T[K]> }> {
	if (t == null) return Empty();
	const loadingOrError = Array.isArray(t) ? t.find(v => isLoadable(v) && !isLoaded(v) && !isEmpty(v)) : Object.values(t ?? {}).find(v => isLoadable(v) && !isLoaded(v) && !isEmpty(v));
	if (loadingOrError) return loadingOrError;
	if (Array.isArray(t)) return Loaded((t).map(v => isLoaded(v) ? v.value : isEmpty(v) ? undefined : v) as any);
	else return Loaded(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, isLoaded(v) ? v.value : isEmpty(v) ? undefined : v])) as any);
}

// some sanity checks
(() => {
	const apiError: ApiError = {httpCode: 0, message: '', name: '', statusText: '', title: ''};
	const loading = Loading();
	const loaded = Loaded(1);
	const error = LoadingError(apiError);
	const empty = Empty();

	const alertAndLog = (msg: string) => { alert(msg); console.error(new Error(msg)); };

	if (!isLoadable(loading)) alertAndLog('isLoadable failed');
	if (!isLoadable(loaded)) alertAndLog('isLoadable failed');
	if (!isLoadable(error)) alertAndLog('isLoadable failed');
	if (!isLoadable(empty)) alertAndLog('isLoadable failed');
	if (!isLoading(loading)) alertAndLog('isLoading failed');
	if (!isLoaded(loaded)) alertAndLog('isLoaded failed');
	if (!isError(error)) alertAndLog('isError failed');
	if (!isEmpty(empty)) alertAndLog('isEmpty failed');

	const combined = combineLoadables([loaded, {a: 2}, loaded] as const);
	if (!isLoaded(combined)) { alertAndLog('combineLoadables failed'); return; }
	if (combined.value[0] !== 1) alertAndLog('combineLoadables failed');
	if (combined.value[1].a !== 2) alertAndLog('combineLoadables failed');
	if (combined.value[2] !== 1) alertAndLog('combineLoadables failed');
	if (!isLoadable(combined)) alertAndLog('combineLoadables failed');
	const toCombine = {a: loaded, b: {a: 2}, c: loaded};
	const combinedObj = combineLoadables(toCombine);
	if (!isLoaded(combinedObj)) { alertAndLog('combineLoadables with object failed'); return; }
	if (combinedObj.value.a !== 1) alertAndLog('combineLoadables with object failed');
	if (combinedObj.value.b.a !== 2) alertAndLog('combineLoadables with object failed');
	if (combinedObj.value.c !== 1) alertAndLog('combineLoadables with object failed');
	if (!isLoadable(combinedObj)) alertAndLog('combineLoadables with object failed');
})();


export class InteractiveLoadable<I, T> {
	private i$: ReplaySubject<I> = new ReplaySubject(1);
	private o$: Observable<Loadable<T>>;
	private unsub: Subscription;

	public state: LoadableState;
	public value: T|undefined;
	public error: ApiError|undefined;

	constructor(processInput: (i$: Observable<I>) => Observable<Loadable<T>>) {
		this.o$ = processInput(this.i$);
		this.unsub = this.o$.subscribe({
			next: v => {
				this.state = v.state;
				this.value = isLoaded(v) ? v.value : undefined;
				this.error = isError(v) ? v.error : undefined;
			},
			error: e => {
				this.state = LoadableState.Error;
				this.value = undefined;
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
				this.value = this.error = undefined;
			}
		});
	}

	public next(i: I) {
		this.i$.next(i);
	}
	public get isLoading(): boolean {
		return isLoading(this as Loadable<T>);
	}
	public get isError(): boolean {
		return isError(this as Loadable<T>);
	}
	public get isEmpty(): boolean {
		return isEmpty(this as Loadable<T>);
	}
	public get isLoaded(): boolean {
		return isLoaded(this as Loadable<T>);
	}

	public dispose() {
		this.unsub.unsubscribe();
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
export function promiseFromLoadableStream<T>(loadableStream: Observable<Loadable<T>>): Promise<T|undefined> {
	return new Promise((resolve, reject) => {
		const sub = loadableStream.pipe(filter(v => !isLoading(v))).subscribe({
			next: v => {
				if (isLoaded(v)) resolve(v.value);
				if (isError(v)) reject(v.error);
				if (isEmpty(v)) resolve(undefined);
			},
			error: e => reject(e),
			complete: () => resolve(undefined)
		});
	});
}

/**
 * Combine either a map of streams or an array of streams, and return a stream that will emit the latest values as a single loadable.
 * It will not emit repeated loading states.
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
			if (prev.state === LoadableState.Loaded) return prev.value === curr.value;
			if (prev.state === LoadableState.Error) return prev.error === curr.error;
			return true; // both empty or both loading -> equal
		})
	);
}