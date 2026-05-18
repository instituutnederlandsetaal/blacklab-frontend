import { tryOnScopeDispose } from '@vueuse/core';
import axios from 'axios';
import { reactive, ref, shallowRef, toRef, toValue, unref, watch, watchEffect, type MaybeRef, type ShallowUnwrapRef } from 'vue';

import { isEmpty, isLoaded, isLoadableLike, Loadable, LoadableState, thisIsEmpty, thisIsError, thisIsLoaded, thisIsLoading } from './loadable';
import { combineLoadablesValue, type MaybeLoadable, type MaybeLoadablesArrayOrObject } from './loadable-operators';

import { ApiError, type CancelableRequest } from '@/shared/api/lib/api-types';

type MaybeRefLoadable<T> = MaybeRef<MaybeLoadable<T>>;
type MaybeRefLoadablesArray = readonly MaybeRefLoadable<unknown>[];
type MaybeRefLoadablesObject = Record<string, MaybeRefLoadable<unknown>>;
type MaybeRefLoadablesArrayOrObject = MaybeRefLoadablesArray | MaybeRefLoadablesObject;

type ResolvedLoadables<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: ShallowUnwrapRef<T[K]>;
};

type ResolvedLoadedValues<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: T[K] extends MaybeRef<MaybeLoadable<infer V>> ? V : never;
};

type ResolvedLoadedValuesIncludingEmpty<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: T[K] extends MaybeRef<MaybeLoadable<infer V>> ? V | undefined : never;
};

export function resolveMaybeRefLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): ResolvedLoadables<T> {
	if (Array.isArray(loadables)) {
		return loadables.map(v => unref(v)) as ResolvedLoadables<T>;
	}
	return Object.fromEntries(Object.entries(loadables).map(([k, v]) => [k, unref(v)])) as ResolvedLoadables<T>;
}

function resolveMaybeRefLoadablesInput<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): ResolvedLoadables<T> & MaybeLoadablesArrayOrObject {
	return resolveMaybeRefLoadables(loadables) as ResolvedLoadables<T> & MaybeLoadablesArrayOrObject;
}

function isRetryableLoadable<T>(loadable: MaybeLoadable<T>): loadable is LoadableFromRequest<T> {
	return typeof (loadable as Partial<LoadableFromRequest<T>>).retry === 'function' && typeof (loadable as Partial<LoadableFromRequest<T>>).stop === 'function';
}

function forEachResolvedLoadable(loadables: MaybeLoadablesArrayOrObject, callback: (loadable: MaybeLoadable<unknown>) => void) {
	(Array.isArray(loadables) ? loadables : Object.values(loadables)).forEach(callback);
}

function combineLoadablesValueIncludingEmpty<T extends MaybeLoadablesArrayOrObject>(loadables: T): Loadable<ResolvedLoadedValuesIncludingEmpty<T>> {
	const unresolved = (Array.isArray(loadables) ? loadables : Object.values(loadables)).find(loadable => !isLoaded(loadable) && !isEmpty(loadable));
	if (unresolved) return Loadable.wrap(unresolved) as Loadable<ResolvedLoadedValuesIncludingEmpty<T>>;

	if (Array.isArray(loadables)) {
		return Loadable.Loaded(loadables.map(loadable => (isLoaded(loadable) ? loadable.value : undefined)) as ResolvedLoadedValuesIncludingEmpty<T>);
	}

	return Loadable.Loaded(Object.fromEntries(Object.entries(loadables).map(([key, loadable]) => [key, isLoaded(loadable) ? loadable.value : undefined])) as ResolvedLoadedValuesIncludingEmpty<T>);
}

function reuseLoadableValueIfUnchanged<T>(previousValue: T | undefined, nextValue: T | undefined): T | undefined {
	if (previousValue == null || nextValue == null) return nextValue;

	if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
		return previousValue.length === nextValue.length && previousValue.every((value, index) => Object.is(value, nextValue[index])) ? previousValue : nextValue;
	}

	if (typeof previousValue === 'object' && typeof nextValue === 'object') {
		const previousEntries = Object.entries(previousValue as Record<string, unknown>);
		const nextEntries = Object.entries(nextValue as Record<string, unknown>);
		return previousEntries.length === nextEntries.length && nextEntries.every(([key, value], index) => previousEntries[index]?.[0] === key && Object.is(previousEntries[index]?.[1], value))
			? previousValue
			: nextValue;
	}

	return nextValue;
}

function forEachUniqueRetryableLoadable(loadables: (MaybeLoadable<unknown> | undefined)[], callback: (loadable: LoadableFromRequest<unknown>) => void) {
	const seen = new Set<MaybeLoadable<unknown>>();
	for (const loadable of loadables) {
		if (!loadable || seen.has(loadable)) continue;
		seen.add(loadable);
		if (isRetryableLoadable(loadable)) callback(loadable);
	}
}

type LoadableStateValue<T, S extends LoadableState> = S extends LoadableState.loaded ? T : S extends LoadableState.error ? ApiError : undefined;
type LoadableStateMapResult<T, U, S extends LoadableState> = S extends LoadableState.loaded ? U : U | T;

function getLoadableStateValue<T, S extends LoadableState>(loadable: MaybeLoadable<T>, state: S): LoadableStateValue<T, S> {
	if (state === LoadableState.loaded) return loadable.value as LoadableStateValue<T, S>;
	if (state === LoadableState.error) return loadable.error as LoadableStateValue<T, S>;
	return undefined as LoadableStateValue<T, S>;
}

function isSingleLoadableInput<T>(value: MaybeRefLoadable<T> | MaybeRefLoadablesArrayOrObject): value is MaybeRefLoadable<T> {
	return isLoadableLike(unref(value as MaybeRef<unknown>));
}

export const loadableFromRefs = <T, E extends object = {}>(state: MaybeRef<LoadableState>, value?: MaybeRef<T | undefined>, error?: MaybeRef<ApiError | undefined>, extra?: E): Loadable<T> & E =>
	reactive({
		...(extra as any),
		state,
		value,
		error,
		isLoading: thisIsLoading,
		isLoaded: thisIsLoaded,
		isError: thisIsError,
		isEmpty: thisIsEmpty,
	});

export type LoadableFromRequest<T> = Loadable<T> & { retry: () => void; stop: () => void };

function createDerivedLoadable<T>(
	startWatching: (applyLoadable: (loadable: MaybeLoadable<T>) => void) => () => void,
	getRetryables: () => (MaybeLoadable<unknown> | undefined)[],
): LoadableFromRequest<T> {
	const current = shallowRef<Loadable<T>>(Loadable.Empty<T>());

	let lastState = current.value.state;
	let lastValue = current.value.value;
	let lastError = current.value.error;

	const applyLoadable = (loadable: MaybeLoadable<T>) => {
		const nextState = loadable.state;
		const nextValue = isLoaded(loadable) ? reuseLoadableValueIfUnchanged(lastValue, loadable.value) : undefined;
		const nextError = nextState === LoadableState.error ? loadable.error : undefined;
		if (Object.is(lastState, nextState) && Object.is(lastValue, nextValue) && Object.is(lastError, nextError)) return;

		lastState = nextState;
		lastValue = nextValue;
		lastError = nextError;
		current.value = Loadable.loadable<T>(nextState, nextValue, nextError);
	};

	const stopWatching = startWatching(applyLoadable);

	const retry = () => {
		forEachUniqueRetryableLoadable(getRetryables(), loadable => loadable.retry());
	};

	const stop = () => {
		stopWatching();
		forEachUniqueRetryableLoadable(getRetryables(), loadable => loadable.stop());
	};

	tryOnScopeDispose(stop);

	return reactive({
		retry,
		stop,
		get state() {
			return current.value.state;
		},
		get value() {
			return current.value.value as T | undefined;
		},
		get error() {
			return current.value.error;
		},
		isLoading: thisIsLoading,
		isLoaded: thisIsLoaded,
		isError: thisIsError,
		isEmpty: thisIsEmpty,
	}) as LoadableFromRequest<T>;
}

function flatMapSingleLoadableReactive<T, U, S extends LoadableState>(
	loadable: MaybeRefLoadable<T>,
	stateToMatch: S,
	mapper: (value: LoadableStateValue<T, S>) => MaybeRefLoadable<U>,
): LoadableFromRequest<LoadableStateMapResult<T, U, S>> {
	let currentSource: MaybeLoadable<T> = Loadable.Empty<T>();
	let currentMapped: MaybeLoadable<U> | undefined;

	return createDerivedLoadable<LoadableStateMapResult<T, U, S>>(
		applyLoadable =>
			watchEffect(
				() => {
					const resolvedSource = unref(loadable) as MaybeLoadable<T>;
					currentSource = resolvedSource;

					if (resolvedSource.state !== stateToMatch) {
						if (currentMapped && currentMapped !== resolvedSource && isRetryableLoadable(currentMapped)) currentMapped.stop();
						currentMapped = undefined;
						applyLoadable(resolvedSource as MaybeLoadable<LoadableStateMapResult<T, U, S>>);
						return;
					}

					const nextMapped = unref(mapper(getLoadableStateValue(resolvedSource, stateToMatch))) as MaybeLoadable<U>;
					if (currentMapped && currentMapped !== nextMapped && isRetryableLoadable(currentMapped)) currentMapped.stop();
					currentMapped = nextMapped;
					applyLoadable(nextMapped as MaybeLoadable<LoadableStateMapResult<T, U, S>>);
				},
				{ flush: 'sync' },
			),
		() => [currentSource, currentMapped],
	);
}

export function combineLoadablesReactive<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): LoadableFromRequest<ResolvedLoadedValues<T>>;
export function combineLoadablesReactive<T extends MaybeRefLoadablesArrayOrObject>(loadables: T, options: { includeEmpty: true }): LoadableFromRequest<ResolvedLoadedValuesIncludingEmpty<T>>;
export function combineLoadablesReactive<T extends MaybeRefLoadablesArrayOrObject>(
	loadables: T,
	options: { includeEmpty?: boolean } = {},
): LoadableFromRequest<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>> {
	return options.includeEmpty ? loadableFromLoadables(loadables, { includeEmpty: true }) : loadableFromLoadables(loadables);
}

export function mapLoadableReactive<T, U, S extends LoadableState.loaded>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: T) => U): LoadableFromRequest<U>;
export function mapLoadableReactive<T, U, S extends LoadableState.error>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: ApiError) => U): LoadableFromRequest<U | T>;
export function mapLoadableReactive<T, U, S extends LoadableState.empty>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => U): LoadableFromRequest<U | T>;
export function mapLoadableReactive<T, U, S extends LoadableState.loading>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => U): LoadableFromRequest<U | T>;
export function mapLoadableReactive<T, U, S extends LoadableState>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: LoadableStateValue<T, S>) => U): LoadableFromRequest<U | T> {
	return flatMapSingleLoadableReactive(loadable, state, value => Loadable.Loaded(mapper(value as LoadableStateValue<T, S>)));
}

export function flatMapLoadableReactive<T, U, S extends LoadableState.loaded>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: T) => MaybeRefLoadable<U>): LoadableFromRequest<U>;
export function flatMapLoadableReactive<T, U, S extends LoadableState.error>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: ApiError) => MaybeRefLoadable<U>): LoadableFromRequest<U | T>;
export function flatMapLoadableReactive<T, U, S extends LoadableState.empty>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => MaybeRefLoadable<U>): LoadableFromRequest<U | T>;
export function flatMapLoadableReactive<T, U, S extends LoadableState.loading>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => MaybeRefLoadable<U>): LoadableFromRequest<U | T>;
export function flatMapLoadableReactive<T, U, S extends LoadableState>(
	loadable: MaybeRefLoadable<T>,
	state: S,
	mapper: (value: LoadableStateValue<T, S>) => MaybeRefLoadable<U>,
): LoadableFromRequest<U | T> {
	return flatMapSingleLoadableReactive(loadable, state, mapper);
}

export const mapErrorReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: ApiError) => U) => mapLoadableReactive(loadable, LoadableState.error, mapper);
export const mapEmptyReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => U) => mapLoadableReactive(loadable, LoadableState.empty, mapper);
export const mapLoadingReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => U) => mapLoadableReactive(loadable, LoadableState.loading, mapper);
export const flatMapErrorReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: ApiError) => MaybeRefLoadable<U>) => flatMapLoadableReactive(loadable, LoadableState.error, mapper);
export const flatMapEmptyReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => MaybeRefLoadable<U>) => flatMapLoadableReactive(loadable, LoadableState.empty, mapper);
export const flatMapLoadingReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => MaybeRefLoadable<U>) => flatMapLoadableReactive(loadable, LoadableState.loading, mapper);

export function mapLoadedReactive<T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T) => U): LoadableFromRequest<U>;
export function mapLoadedReactive<T extends MaybeRefLoadablesArrayOrObject, U>(loadables: T, mapper: (values: ResolvedLoadedValues<T>) => U): LoadableFromRequest<U>;
export function mapLoadedReactive<T extends MaybeRefLoadablesArrayOrObject, U>(
	loadables: T | MaybeRefLoadable<ResolvedLoadedValues<T>>,
	mapper: (values: ResolvedLoadedValues<T>) => U,
): LoadableFromRequest<U> {
	return isSingleLoadableInput(loadables)
		? mapLoadableReactive(loadables, LoadableState.loaded, mapper as (value: ResolvedLoadedValues<T>) => U)
		: mapLoadableReactive(loadableFromLoadables(loadables), LoadableState.loaded, mapper);
}

export function flatMapLoadedReactive<T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T) => MaybeRefLoadable<U>): LoadableFromRequest<U>;
export function flatMapLoadedReactive<T extends MaybeRefLoadablesArrayOrObject, U>(loadables: T, mapper: (values: ResolvedLoadedValues<T>) => MaybeRefLoadable<U>): LoadableFromRequest<U>;
export function flatMapLoadedReactive<T extends MaybeRefLoadablesArrayOrObject, U>(
	loadables: T | MaybeRefLoadable<ResolvedLoadedValues<T>>,
	mapper: (values: ResolvedLoadedValues<T>) => MaybeRefLoadable<U>,
): LoadableFromRequest<U> {
	return isSingleLoadableInput(loadables)
		? flatMapLoadableReactive(loadables, LoadableState.loaded, mapper as (value: ResolvedLoadedValues<T>) => MaybeRefLoadable<U>)
		: flatMapLoadableReactive(loadableFromLoadables(loadables), LoadableState.loaded, mapper);
}

export function loadableFromLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): LoadableFromRequest<ResolvedLoadedValues<T>>;
export function loadableFromLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T, options: { includeEmpty: true }): LoadableFromRequest<ResolvedLoadedValuesIncludingEmpty<T>>;
export function loadableFromLoadables<T extends MaybeRefLoadablesArrayOrObject>(
	loadables: T,
	options: { includeEmpty?: boolean } = {},
): LoadableFromRequest<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>> {
	return createDerivedLoadable<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>>(
		applyLoadable =>
			watchEffect(
				() => {
					const resolved = resolveMaybeRefLoadablesInput(loadables);
					const combined = (options.includeEmpty ? combineLoadablesValueIncludingEmpty(resolved) : Loadable.wrap(combineLoadablesValue(resolved))) as MaybeLoadable<
						ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>
					>;
					applyLoadable(combined);
				},
				{ flush: 'sync' },
			),
		() => {
			const resolved = resolveMaybeRefLoadablesInput(loadables);
			const retryables: MaybeLoadable<unknown>[] = [];
			forEachResolvedLoadable(resolved, loadable => retryables.push(loadable));
			return retryables;
		},
	);
}

/**
 * Create a Loadable that is driven by a CancelableRequest. The request is triggered immediately, and can be retriggered by calling retry(). The request can be cancelled by calling stop().
 * This is basically a simple wrapper to go from async behavior to reactive behavior.
 *
 * When called from within a vue component, cleanup will happen automatically on unmount,
 * but otherwise,
 * Don't forget to call stop() after you're done with it, or the stream will keep running.
 */
export function loadableFromRequest<T>(makeRequest: () => CancelableRequest<T>): LoadableFromRequest<T> {
	const value = ref<T>();
	const error = ref<ApiError>();
	const state = ref<LoadableState>(LoadableState.empty);

	let r: CancelableRequest<T>;
	function retry() {
		if (r) r.cancel();
		const localR = (r = makeRequest());
		r.then(
			v => {
				if (localR !== r) return; // request cancelled or retried, ignore
				value.value = v;
				error.value = undefined;
				state.value = LoadableState.loaded;
			},
			e => {
				if (localR !== r) return; // request cancelled or retried, ignore

				if ((e instanceof ApiError && e.isCancelledRequest) || axios.isCancel(e)) {
					value.value = undefined;
					error.value = undefined;
					state.value = LoadableState.empty;
				} else {
					value.value = undefined;
					error.value = ApiError.wrap(e);
					state.value = LoadableState.error;
				}
			},
		);
	}
	function stop() {
		r?.cancel();
	}

	tryOnScopeDispose(stop);

	retry(); // initial request.
	return loadableFromRefs(state, value, error, { retry, stop });
}

export function loadableFromComputedRequest<T>(request: MaybeRef<CancelableRequest<T>>): LoadableFromRequest<T> {
	request = toRef(request);
	const inner = loadableFromRequest(() => toValue(request));
	watch(request, _ => inner.retry()); // not immediate! inner has already started
	return inner;
}
