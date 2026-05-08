import axios from 'axios';
import { computed, hasInjectionContext, onScopeDispose, reactive, ref, toRef, toValue, unref, watch, type ComputedRef, type MaybeRef } from 'vue';

import { ApiError, type CancelableRequest } from '@/_new/shared/api/lib/api-types';

import { isLoaded, Loadable, LoadableState, thisIsEmpty, thisIsError, thisIsLoaded, thisIsLoading } from './loadable';
import { combineLoadablesValue, type MaybeLoadable, type MaybeLoadablesInput } from './loadable-operators';

type MaybeRefLoadable<T> = MaybeRef<MaybeLoadable<T>>;
type MaybeRefLoadablesArray = readonly MaybeRefLoadable<unknown>[];
type MaybeRefLoadablesObject = Record<string, MaybeRefLoadable<unknown>>;
type MaybeRefLoadablesInput = MaybeRefLoadablesArray | MaybeRefLoadablesObject;
type UnrefMaybeRef<T> = T extends MaybeRef<infer U> ? U : T;

type ResolvedLoadables<T extends MaybeRefLoadablesInput> = {
	[K in keyof T]: UnrefMaybeRef<T[K]>;
};

type ResolvedLoadedValues<T extends MaybeRefLoadablesInput> = {
	[K in keyof T]: T[K] extends MaybeRef<MaybeLoadable<infer V>> ? V : never;
};

export function resolveMaybeRefLoadables<T extends MaybeRefLoadablesInput>(loadables: T): ResolvedLoadables<T> {
	if (Array.isArray(loadables)) {
		return loadables.map(v => unref(v)) as ResolvedLoadables<T>;
	}

	return Object.fromEntries(Object.entries(loadables).map(([k, v]) => [k, unref(v)])) as ResolvedLoadables<T>;
}

function resolveMaybeRefLoadablesInput<T extends MaybeRefLoadablesInput>(loadables: T): ResolvedLoadables<T> & MaybeLoadablesInput {
	return resolveMaybeRefLoadables(loadables) as ResolvedLoadables<T> & MaybeLoadablesInput;
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

export function combineLoadablesReactive<T extends MaybeRefLoadablesInput>(loadables: T): ComputedRef<Loadable<ResolvedLoadedValues<T>>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		return Loadable.wrap(combined);
	});
}

export function mapLoadedReactive<T extends MaybeRefLoadablesInput, U>(loadables: T, mapper: (values: ResolvedLoadedValues<T>) => U): ComputedRef<Loadable<U>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		if (!isLoaded(combined)) return Loadable.wrap(combined as MaybeLoadable<U>);
		return Loadable.Loaded(mapper(combined.value as ResolvedLoadedValues<T>));
	});
}

export function flatMapLoadedReactive<T extends MaybeRefLoadablesInput, U>(loadables: T, mapper: (values: ResolvedLoadedValues<T>) => MaybeLoadable<U>): ComputedRef<Loadable<U>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		if (!isLoaded(combined)) return Loadable.wrap(combined as MaybeLoadable<U>);
		const mapped = mapper(combined.value as ResolvedLoadedValues<T>);
		return Loadable.wrap(mapped);
	});
}

export type LoadableFromRequest<T> = Loadable<T> & { retry: () => void; stop: () => void };

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

	if (hasInjectionContext()) {
		onScopeDispose(stop);
	}
	retry(); // initial request.
	return loadableFromRefs(state, value, error, { retry, stop });
}

export function loadableFromComputedRequest<T>(request: MaybeRef<CancelableRequest<T>>): LoadableFromRequest<T> {
	request = toRef(request);
	const inner = loadableFromRequest(() => toValue(request));
	watch(request, _ => inner.retry()); // not immediate! inner has already started
	return inner;
}
