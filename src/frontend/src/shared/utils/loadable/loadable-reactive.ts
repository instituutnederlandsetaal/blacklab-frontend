import { tryOnScopeDispose } from '@vueuse/core';
import axios from 'axios';
import { reactive, ref, shallowRef, toRef, toValue, unref, watch, watchEffect, type MaybeRef, type Ref } from 'vue';

import { getLoadableStateValue, isLoaded, isLoadableLike, Loadable, LoadableState, withLoadableMethods, type LoadableLike, type LoadableStateValue } from './loadable';
import { combineLoadablesValue, combineLoadablesValueIncludingEmpty, type MaybeLoadable, type MaybeLoadablesArrayOrObject } from './loadable-operators';

import { ApiError, type CancelableRequest } from '@/shared/api/lib/api-types';

type MaybeRefLoadable<T> = MaybeRef<MaybeLoadable<T>>;
type MaybeRefLoadablesArray = readonly MaybeRefLoadable<unknown>[];
type MaybeRefLoadablesObject = Record<string, MaybeRefLoadable<unknown>>;
type MaybeRefLoadablesArrayOrObject = MaybeRefLoadablesArray | MaybeRefLoadablesObject;
type ResolvedMaybeRef<T> = T extends Ref<infer V> ? V : T;

type ResolvedLoadables<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: ResolvedMaybeRef<T[K]>;
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

type LoadableStateMapResult<T, U, S extends LoadableState> = S extends LoadableState.loaded ? U : U | T;

function isSingleLoadableInput<T>(value: MaybeRefLoadable<T> | MaybeRefLoadablesArrayOrObject): value is MaybeRefLoadable<T> {
	return isLoadableLike(unref(value as MaybeRef<unknown>));
}

type LoadableRequestControls = { retry: () => void; stop: () => void };
type WritableLoadableRefs<T> = {
	state: Ref<LoadableState>;
	value: Ref<T | undefined>;
	error: Ref<ApiError | undefined>;
};

function reactiveLoadableFromRefs<T, E extends object>(refs: WritableLoadableRefs<T>, extra: E): Loadable<T> & E {
	const r = reactive({
		...(extra as E),
		state: refs.state,
		value: refs.value,
		error: refs.error,
	});
	return withLoadableMethods<T, LoadableLike<T> & E>(r as LoadableLike<T> & E);
}

function applyLoadableToRefs<T>(refs: WritableLoadableRefs<T>, loadable: MaybeLoadable<T>, options: { reuseLoadedValue?: boolean } = {}) {
	const nextState = loadable.state;
	const nextValue = isLoaded(loadable) ? (options.reuseLoadedValue ? reuseLoadableValueIfUnchanged(refs.value.value, loadable.value) : loadable.value) : undefined;
	const nextError = nextState === LoadableState.error ? loadable.error : undefined;

	if (Object.is(refs.state.value, nextState) && Object.is(refs.value.value, nextValue) && Object.is(refs.error.value, nextError)) return;

	if (refs.state.value === nextState) {
		refs.value.value = nextValue;
		refs.error.value = nextError;
		return;
	}

	if (nextState === LoadableState.loaded) {
		refs.value.value = nextValue;
		refs.state.value = nextState;
		refs.error.value = undefined;
		return;
	}

	if (nextState === LoadableState.error) {
		refs.error.value = nextError;
		refs.state.value = nextState;
		refs.value.value = undefined;
		return;
	}

	refs.state.value = nextState;
	refs.value.value = undefined;
	refs.error.value = undefined;
}

export const loadableFromRefs = <T, E extends object = {}>(state: MaybeRef<LoadableState>, value?: MaybeRef<T | undefined>, error?: MaybeRef<ApiError | undefined>, extra?: E): Loadable<T> & E => {
	return reactiveLoadableFromRefs<T, E>(
		{
			state: toRef(state) as Ref<LoadableState>,
			value: (value == null ? ref<T>() : toRef(value)) as Ref<T | undefined>,
			error: (error == null ? ref<ApiError>() : toRef(error)) as Ref<ApiError | undefined>,
		},
		extra as E,
	);
};

export type LoadableFromRequest<T> = Loadable<T> & { retry: () => void; stop: () => void };

function createDerivedLoadable<T>(
	startWatching: (applyLoadable: (loadable: MaybeLoadable<T>) => void) => () => void,
	getRetryables: () => (MaybeLoadable<unknown> | undefined)[],
): LoadableFromRequest<T> {
	const refs: WritableLoadableRefs<T> = {
		state: shallowRef(LoadableState.empty),
		value: shallowRef<T | undefined>(),
		error: shallowRef<ApiError | undefined>(),
	};
	const applyLoadable = (loadable: MaybeLoadable<T>) => applyLoadableToRefs(refs, loadable, { reuseLoadedValue: true });

	const stopWatching = startWatching(applyLoadable);

	const retry = () => {
		forEachUniqueRetryableLoadable(getRetryables(), loadable => loadable.retry());
	};

	const stop = () => {
		stopWatching();
		forEachUniqueRetryableLoadable(getRetryables(), loadable => loadable.stop());
	};

	tryOnScopeDispose(stop);

	return reactiveLoadableFromRefs<T, LoadableRequestControls>(refs, { retry, stop }) as LoadableFromRequest<T>;
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
	return options.includeEmpty ? combineLoadables(loadables, { includeEmpty: true }) : combineLoadables(loadables);
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
		: mapLoadableReactive(combineLoadables(loadables), LoadableState.loaded, mapper);
}

export function flatMapLoadedReactive<T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T) => MaybeRefLoadable<U>): LoadableFromRequest<U>;
export function flatMapLoadedReactive<T extends MaybeRefLoadablesArrayOrObject, U>(loadables: T, mapper: (values: ResolvedLoadedValues<T>) => MaybeRefLoadable<U>): LoadableFromRequest<U>;
export function flatMapLoadedReactive<T extends MaybeRefLoadablesArrayOrObject, U>(
	loadables: T | MaybeRefLoadable<ResolvedLoadedValues<T>>,
	mapper: (values: ResolvedLoadedValues<T>) => MaybeRefLoadable<U>,
): LoadableFromRequest<U> {
	return isSingleLoadableInput(loadables)
		? flatMapLoadableReactive(loadables, LoadableState.loaded, mapper as (value: ResolvedLoadedValues<T>) => MaybeRefLoadable<U>)
		: flatMapLoadableReactive(combineLoadables(loadables), LoadableState.loaded, mapper);
}

export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): LoadableFromRequest<ResolvedLoadedValues<T>>;
export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T, options: { includeEmpty: true }): LoadableFromRequest<ResolvedLoadedValuesIncludingEmpty<T>>;
export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(
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
