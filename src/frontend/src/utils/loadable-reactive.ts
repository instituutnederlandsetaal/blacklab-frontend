import { computed, reactive, unref, type ComputedRef, type MaybeRef } from 'vue';

import type { ApiError } from '@/_new/shared/api/lib/api-types';
import { isLoaded, Loadable, thisIsEmpty, thisIsError, thisIsLoaded, thisIsLoading, type LoadableState } from '@/utils/loadable';
import {
	combineLoadablesValue,
	type MaybeLoadable,
	type MaybeLoadablesInput,
} from '@/utils/loadable-operators';

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

	return Object.fromEntries(
		Object.entries(loadables).map(([k, v]) => [k, unref(v)])
	) as ResolvedLoadables<T>;
}

function resolveMaybeRefLoadablesInput<T extends MaybeRefLoadablesInput>(loadables: T): ResolvedLoadables<T> & MaybeLoadablesInput {
	return resolveMaybeRefLoadables(loadables) as ResolvedLoadables<T> & MaybeLoadablesInput;
}


export const loadableFromRefs = <T, E extends object = {}>(state: MaybeRef<LoadableState>, value?: MaybeRef<T|undefined>, error?: MaybeRef<ApiError|undefined>, extra?: E): Loadable<T>&E => reactive({
	...extra as any,
	state,
	value,
	error,
	isLoading: thisIsLoading,
	isLoaded: thisIsLoaded,
	isError: thisIsError,
	isEmpty: thisIsEmpty,
});


export function combineLoadablesReactive<T extends MaybeRefLoadablesInput>(
	loadables: T
): ComputedRef<Loadable<ResolvedLoadedValues<T>>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		return Loadable.wrap(combined);
	});
}

export function mapLoadedReactive<T extends MaybeRefLoadablesInput, U>(
	loadables: T,
	mapper: (values: ResolvedLoadedValues<T>) => U
): ComputedRef<Loadable<U>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		if (!isLoaded(combined)) return Loadable.wrap(combined as MaybeLoadable<U>);
		return Loadable.Loaded(mapper(combined.value as ResolvedLoadedValues<T>));
	});
}

export function flatMapLoadedReactive<T extends MaybeRefLoadablesInput, U>(
	loadables: T,
	mapper: (values: ResolvedLoadedValues<T>) => MaybeLoadable<U>
): ComputedRef<Loadable<U>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		if (!isLoaded(combined)) return Loadable.wrap(combined as MaybeLoadable<U>);
		const mapped = mapper(combined.value as ResolvedLoadedValues<T>);
		return Loadable.wrap(mapped);
	});
}


export {
	combineLoadablesValue, flatMapLoadedValue, mapLoadedValue
} from '@/utils/loadable-operators';

