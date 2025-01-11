import { map, Observable, OperatorFunction, Subscription } from 'rxjs';
import jsonStableStringify from 'json-stable-stringify';
import { ApiError, Canceler } from '@/api';
import { CancelableRequest } from '@/api/apiutils';

export enum LoadableState {
	Loading = 'loading',
	Loaded = 'loaded',
	Error = 'error',
	Empty = 'empty'
}

export type Loading<T> = {state: LoadableState.Loading};
export type Loaded<T> = {state: LoadableState.Loaded, value: T};
export type LoadingError<T> = {state: LoadableState.Error, error: ApiError};
export type Empty<T> = {state: LoadableState.Empty, value: undefined};
export type Loadable<T> = Loading<T> | Loaded<T> | LoadingError<T> | Empty<T>;

export const Loading = <T>(): Loading<T> => ({state: LoadableState.Loading});
export const Loaded = <T>(value: T): Loaded<T> => ({state: LoadableState.Loaded, value});
export const LoadingError = <T>(error: ApiError): LoadingError<T> => ({state: LoadableState.Error, error});
export const Empty = <T>(): Empty<T> => ({state: LoadableState.Empty, value: undefined});

export const isLoadable = <T>(v: any): v is Loadable<T> => {
	if (!v || typeof v !== 'object' || !('state' in v)) return false;
	if (!Object.values(LoadableState).includes(v.state)) return false;
	if (v.state === LoadableState.Loaded && !('value' in v)) return false;
	if (v.state === LoadableState.Empty && 'value' in v && v.value !== undefined) return false;
	return true;
};
export const isLoaded = <T>(v: Loadable<T>): v is Loaded<T> => v.state === LoadableState.Loaded;
export const isLoading = <T>(v: Loadable<T>): v is Loading<T> => v.state === LoadableState.Loading;
export const isError = <T>(v: Loadable<T>): v is LoadingError<T> => v.state === LoadableState.Error;
export const isEmpty = <T>(v: Loadable<T>): v is Empty<T> => v.state === LoadableState.Empty;

type LoadableTypeFromState<T> = {
	[LoadableState.Loading]: Loading<T>;
	[LoadableState.Loaded]: Loaded<T>;
	[LoadableState.Error]: LoadingError<T>;
	[LoadableState.Empty]: Empty<T>;
}

export function mapLoaded<T, U>(mapper: (v: T) => U): OperatorFunction<Loadable<T>, Loadable<U>> {
	return map(v => isLoaded(v) ? Loaded(mapper(v.value)) : v);
}

/** Map the request/canceler into an observable. The observable will never error, but instead emit an error object. */
export const toObservable = <T>({cancel, request}: CancelableRequest<T>) => new Observable<Loadable<T>>(observer => {
	observer.next(Loading());
	request.then(v => {
		observer.next(Loaded(v));
		observer.complete();
	}).catch((e: ApiError) => {
		if (e.title === 'Request cancelled') observer.complete();
		else observer.next(LoadingError(e));
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
type ValuesExcludingEmpty<Input extends readonly any[]> = { [K in keyof Input]:
	Input[K] extends Loaded<infer L> ? L :
	Input[K] extends LoadingError<infer L> ? never :
	Input[K] extends Empty<infer L> ? never :
	Input[K] extends Loading<infer L> ? L :
	Input[K] extends Loadable<infer L> ? L :
	Input[K] extends any ? Input[K] :
	never;
};
/**
 * Given an array of objects and/or loadables, return a type with the same object, except with loadables replaced by their T type or undefined
 * E.g. [Loadable<T>, {a: number}, Loadable<U>] -> [T|undefined, {a: number}, U|undefined]
*/
type ValuesIncludingEmpty<Input extends readonly any[]> = { [K in keyof Input]:
	Input[K] extends Loaded<infer L> ? L :
	Input[K] extends LoadingError<infer L> ? never :
	Input[K] extends Empty<infer L> ? undefined :
	Input[K] extends Loading<infer L> ? L :
	Input[K] extends Loadable<infer L> ? L|undefined :
	Input[K] extends any ? Input[K] :
	never;
}

/**
 * Given an Array of objects and/or loadables, return a Loadable with the Array as value, except with loadables replaced by their value.
 * If any of the loadables are loading, empty, or errored, return that state instead.
 * Basically, if everything is loaded, return a loadable holding the value, otherwise return the reason we can't return the value.
 *
 * E.g. [Loaded<T>, {a: number}, Loaded<U>]       -> Loaded<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, LoadingError<U>] -> LoadingError<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Empty<U>]        -> Empty<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Loading<U>]      -> Loading<[T, {a: number}, U]>
 */
export function combineLoadables<T extends readonly any[]>(t: T): Loadable<ValuesExcludingEmpty<T>> {
	const loadingOrErrorOrEmpty = t.find(v => isLoadable(v) && !isLoaded(v));
	if (loadingOrErrorOrEmpty) return loadingOrErrorOrEmpty;
	else return Loaded(t.map((v: Loaded<any>) => isLoaded(v) ? v.value : v) as any);
}
/**
 * Given an Array of objects and/or loadables, return a Loadable with the Array as value, except with loadables replaced by their value.
 * If any of the loadables are loading, empty, or errored, return that state instead.
 * Basically, if everything is loaded, return a loadable holding the value, otherwise return the reason we can't return the value.
 *
 * E.g. [Loaded<T>, {a: number}, Loaded<U>]       -> Loaded<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, LoadingError<U>] -> LoadingError<[T, {a: number}, U]>
 * E.g. [Loaded<T>, {a: number}, Empty<U>]        -> Loaded<[T, {a: number}, undefined]>   -- NOTE the undefined versus Empty
 * E.g. [Loaded<T>, {a: number}, Loading<U>]      -> Loading<[T, {a: number}, U]>
 */
export function combineLoadablesIncludingEmpty<T extends readonly any[]>(t: T): Loadable<ValuesIncludingEmpty<T>> {
	const loadingOrError = t.find(v => isLoadable(v) && !isLoaded(v) && !isEmpty(v));
	if (loadingOrError) return loadingOrError;
	else return Loaded(t.map(v => isLoaded(v) ? v.value : isEmpty(v) ? undefined : v) as any);
}

const test = [Loaded(1), {a: 2}, Empty<3>()] as const;
type test2 = ValuesIncludingEmpty<typeof test>; // [number, {a: number}, number]


// some sanity checks
(() => {
	const apiError: ApiError = {httpCode: 0, message: '', name: '', statusText: '', title: ''};
	const loading = Loading();
	const loaded = Loaded(1);
	const error = LoadingError(apiError);
	const empty = Empty();

	const alertAndLog = (msg: string) => { alert(msg); console.error(msg); };

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
})();