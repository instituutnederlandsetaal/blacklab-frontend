/**
 * Helpers for async data and observable objects.
 * The main type is Loadable<T>, which can represent a value that is loading, loaded, errored, or empty.
 * There are various functions to e.g. create streams of Loadable<T> from http requests, map loaded values, and combine multiple Loadables into one.
 *
 * E.g.
 * - Loadable<T> is a type that can represent a value that is loading, loaded, errored, or empty.
 * - asObservable() can turn an http request into a stream that emits loading, loaded, and error states.
 * - combineLoadables() can combine multiple Loadable<T> into a single Loadable<[T1, T2, ...]> that is loaded if all are loaded, and otherwise in the state of the first non-loaded one.
 * - mapLoaded/switchMapLoaded run only for Loaded values; Loading/Empty/Error states are passed through.
 *
 * Example code:
 * pipe(
 *   // begin with a url, make a get request to the url whenever it changes
 *   map<string, CancelableRequest<T>>(url => api.get(url)),
 *   // From the request/canceler, create a stream that emits loading, loaded, and error states.
 *   switchMap(request => asObservable(request)),
 *   // Every time the stream emits a value (loading, loaded, error), log it.
 *   tap(loadable => console.debug(loadable))
 * )
 */

import { tryOnScopeDispose } from '@vueuse/core';
import type { Canceler } from 'axios';
import type { ObservableInput, ObservedValueOf, OperatorFunction } from 'rxjs';
import { combineLatest, distinctUntilChanged, map, Observable, of, Subject, switchMap, timer } from 'rxjs';
import { shallowRef } from 'vue';

import type { MarkRequiredAndNotNull } from '@/types/helpers';

import { combine, combineOptional } from './loadable-combine';
import type { Val, ValEmpty, ValueTypeFromLoadableOrObservable } from './loadable-core';
import { isError, isLoaded, isLoading, Loadable } from './loadable-core';
import { loadableReactiveFromSnapshot } from './loadable-reactive';

import { ApiError } from '@/shared/api/lib/api-types';
import { stableStringify } from '@/shared/utils/stable-stringify';

/** Map Loaded values and pass through the exact Loading, Empty, or Error object. */
export const mapLoaded = <T, U>(mapper: (value: T) => U): OperatorFunction<Loadable<T>, Loadable<U>> =>
	map(value => (isLoaded(value) ? Loadable.Loaded(mapper(value.value)) : (value as unknown as Loadable<U>)));

/** Switch-map Loaded values and cancel the previous inner stream when any new state arrives. */
export const switchMapLoaded = <T, U extends Loadable<any>>(mapper: (value: T) => ObservableInput<U>): OperatorFunction<Loadable<T>, U> =>
	switchMap(value => (isLoaded(value) ? mapper(value.value) : of(value as U)));

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
export const toObservable = <T>({ cancel, request }: { cancel: Canceler; request: Promise<T> }) =>
	new Observable<Loadable<T>>(observer => {
		observer.next(Loadable.Loading());
		request
			.then(v => observer.next(Loadable.Loaded(v)))
			.catch((e: unknown) => {
				// A canceled request should not leave downstream combined streams in Loading forever.
				const error = ApiError.wrap(e);
				if (error.isCancelledRequest) observer.next(Loadable.Empty());
				else observer.next(Loadable.LoadingError(error));
			})
			.finally(() => observer.complete());

		// When the observable is unsubscribed, cancel the request.
		return cancel; // cleanup for when the observable is unsubscribed.
	});

/**
 * Unpack Observables and Loadables into their .value type.
 * If the static type of the Loadable is known (e.g. Empty<T>), return the statically known type (e.g. T for Loaded<T>, never for Empty<T> and LoadingError<T>).
 * @example ValueTypeFromLoadableOrObservableIncludingEmpty<Observable<Loadable<T>>> -> T|undefined
 * @example ValueTypeFromLoadableOrObservableIncludingEmpty<Loadable<T>> -> T|undefined
 * @example ValueTypeFromLoadableOrObservableIncludingEmpty<T> -> T
 */
type ValueTypeFromLoadableOrObservableIncludingEmpty<T> = ValEmpty<T extends ArrayLike<any> ? T : T extends ObservableInput<any> ? ObservedValueOf<T> : T>;

export const compareAsSortedJson = <T1, T2>(a: T1, b: T2) => stableStringify(a) === stableStringify(b);

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
export function combineLoadables<T extends readonly any[] | Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: Val<T[K]> }> {
	if (t == null) return Loadable.Empty();
	return Loadable.wrap(combine(t)) as Loadable<{ [K in keyof T]: Val<T[K]> }>;
}
/**
 * Same as combineLoadables, but also includes Empty states. So if an Empty is present, this will return Loaded<undefined> instead of Empty.
 * E.g. [Loaded<T>, {a: number}, Empty<U>] -> Loaded<[T, {a: number}, undefined]>
 */
export function combineLoadablesIncludingEmpty<T extends readonly any[] | Record<string, any>>(t?: T): Loadable<{ [K in keyof T]: ValEmpty<T[K]> }> {
	if (t == null) return Loadable.Empty();
	return Loadable.wrap(combineOptional(t)) as Loadable<{ [K in keyof T]: ValEmpty<T[K]> }>;
}

type InputDebounce<T> = number | ((input: T) => number);

export function createInteractiveLoadable<TInput, TOutput>(processInput: (i$: Observable<TInput>) => Observable<Loadable<TOutput>>, debounce: InputDebounce<TInput>) {
	const i$ = new Subject<TInput>();
	const snapshot = shallowRef<Loadable<TOutput>>(Loadable.Empty());
	const input$ = i$.pipe(
		switchMap(input => {
			const delay = typeof debounce === 'function' ? debounce(input) : debounce;
			return delay > 0 ? timer(delay).pipe(map(() => input)) : of(input);
		}),
	);
	const subscription = processInput(input$).subscribe({
		next: value => (snapshot.value = value),
		error: error => (snapshot.value = Loadable.LoadingError(ApiError.wrap(error))),
		complete: () => (snapshot.value = Loadable.Empty()),
	});
	return loadableReactiveFromSnapshot(snapshot, {
		next: (input: TInput) => i$.next(input),
		dispose: () => subscription.unsubscribe(),
	});
}

/**
 * Return a reactive Loadable that mirrors a stream and unsubscribes with the current Vue scope.
 */
export function loadableFromStream<T>(stream$: Observable<T>): Loadable<ValueTypeFromLoadableOrObservable<T>> {
	type Value = ValueTypeFromLoadableOrObservable<T>;
	const snapshot = shallowRef<Loadable<Value>>(Loadable.Empty());
	const subscription = stream$.pipe(map(Loadable.wrap)).subscribe({
		next: value => (snapshot.value = value),
		error: error => (snapshot.value = Loadable.LoadingError(ApiError.wrap(error))),
		complete: () => {
			if (isLoading(snapshot.value)) snapshot.value = Loadable.Empty();
		},
	});
	tryOnScopeDispose(() => subscription.unsubscribe());
	return loadableReactiveFromSnapshot(snapshot, {});
}

function combineLoadableStreamsImpl(
	combiner: typeof combineLoadables | typeof combineLoadablesIncludingEmpty,
	streams: ObservableInput<any>[] | Record<string, ObservableInput<any>>,
): Observable<Loadable<any>> {
	const combined$: ObservableInput<Record<string, any> | any[]> = Array.isArray(streams) ? combineLatest(streams) : combineLatest(streams as Record<string, Observable<any>>);

	return combined$.pipe(
		map(values => combiner(values)),
		distinctUntilChanged((prev, curr) => {
			if (prev.state !== curr.state) return false;
			if (isLoaded(prev) && isLoaded(curr)) return prev.value === curr.value;
			if (isError(prev) && isError(curr)) return prev.error === curr.error;
			return true; // both empty or both loading -> equal
		}),
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
export function combineLoadableStreams(streams: Observable<any>[] | Record<string, Observable<any>>): Observable<Loadable<any>> {
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
export function combineLoadableStreamsIncludingEmpty<T extends readonly ObservableInput<any>[]>(
	streams: T,
): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservableIncludingEmpty<T[K]> }>>;
export function combineLoadableStreamsIncludingEmpty<T extends Record<string, ObservableInput<any>>>(
	streams: T,
): Observable<Loadable<{ [K in keyof T]: ValueTypeFromLoadableOrObservableIncludingEmpty<T[K]> }>>;
export function combineLoadableStreamsIncludingEmpty(streams: ObservableInput<any>[] | Record<string, ObservableInput<any>>): Observable<Loadable<any>> {
	return combineLoadableStreamsImpl(combineLoadablesIncludingEmpty, streams);
}
