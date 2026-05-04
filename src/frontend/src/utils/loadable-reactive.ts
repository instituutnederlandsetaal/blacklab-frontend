import { computed, unref, type ComputedRef, type MaybeRef } from 'vue';

import { isLoaded, Loadable, type LoadableLike } from '@/utils/loadable-streams';

export type MaybeLoadable<T> = LoadableLike<T> | Loadable<T>;
type MaybeLoadablesArray = readonly MaybeLoadable<unknown>[];
type MaybeLoadablesObject = Record<string, MaybeLoadable<unknown>>;
type MaybeLoadablesInput = MaybeLoadablesArray | MaybeLoadablesObject;

type LoadablesArray = readonly Loadable<unknown>[];
type LoadablesObject = Record<string, Loadable<unknown>>;
type LoadablesInput = LoadablesArray | LoadablesObject;

type MaybeRefLoadable<T> = MaybeRef<MaybeLoadable<T>>;
type MaybeRefLoadablesArray = readonly MaybeRefLoadable<unknown>[];
type MaybeRefLoadablesObject = Record<string, MaybeRefLoadable<unknown>>;
type MaybeRefLoadablesInput = MaybeRefLoadablesArray | MaybeRefLoadablesObject;
type UnrefMaybeRef<T> = T extends MaybeRef<infer U> ? U : T;

type LoadedValues<T extends MaybeLoadablesInput> = {
	[K in keyof T]: T[K] extends MaybeLoadable<infer V> ? V : never;
};

type ResolvedLoadables<T extends MaybeRefLoadablesInput> = {
	[K in keyof T]: UnrefMaybeRef<T[K]>;
};

type ResolvedLoadedValues<T extends MaybeRefLoadablesInput> = {
	[K in keyof T]: T[K] extends MaybeRef<MaybeLoadable<infer V>> ? V : never;
};

type PassthroughFrom<T extends MaybeLoadablesInput> = T extends readonly MaybeLoadable<unknown>[] ? T[number] : T[keyof T];


function toRichLoadable<T>(loadable: MaybeLoadable<T>): Loadable<T> {
	return Loadable.wrap(loadable);
}

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

export function firstNonLoaded<T extends MaybeLoadablesInput>(loadables: T): PassthroughFrom<T>|undefined {
	const values = Array.isArray(loadables) ? loadables : Object.values(loadables);
	return values.find(v => !isLoaded(v)) as PassthroughFrom<T>|undefined;
}

export function extractLoadedValues<T extends MaybeLoadablesInput>(loadables: T): LoadedValues<T> {
	if (Array.isArray(loadables)) {
		return loadables.map(v => v.value) as LoadedValues<T>;
	}

	return Object.fromEntries(
		Object.entries(loadables).map(([k, v]) => [k, v.value])
	) as LoadedValues<T>;
}

export function combineLoadablesValue<T extends LoadablesInput>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>>;
export function combineLoadablesValue<T extends MaybeLoadablesInput>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>>;
export function combineLoadablesValue<T extends MaybeLoadablesInput>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>> {
	const nonLoaded = firstNonLoaded(loadables);
	if (nonLoaded) return nonLoaded;
	return Loadable.Loaded(extractLoadedValues(loadables));
}

export function mapLoadedValue<T extends LoadablesInput, U>(
	loadables: T,
	mapper: (values: LoadedValues<T>) => U
): PassthroughFrom<T> | Loadable<U>;
export function mapLoadedValue<T extends MaybeLoadablesInput, U>(
	loadables: T,
	mapper: (values: LoadedValues<T>) => U
): PassthroughFrom<T> | Loadable<U>;
export function mapLoadedValue<T extends MaybeLoadablesInput, U>(
	loadables: T,
	mapper: (values: LoadedValues<T>) => U
): PassthroughFrom<T> | Loadable<U> {
	const combined = combineLoadablesValue(loadables);
	if (!isLoaded(combined)) return combined as PassthroughFrom<T>;
	const loadedValue = combined.value as LoadedValues<T>;
	return Loadable.Loaded(mapper(loadedValue));
}

export function flatMapLoadedValue<T extends LoadablesInput, U>(
	loadables: T,
	mapper: (values: LoadedValues<T>) => MaybeLoadable<U>
): PassthroughFrom<T> | MaybeLoadable<U>;
export function flatMapLoadedValue<T extends MaybeLoadablesInput, U>(
	loadables: T,
	mapper: (values: LoadedValues<T>) => MaybeLoadable<U>
): PassthroughFrom<T> | MaybeLoadable<U>;
export function flatMapLoadedValue<T extends MaybeLoadablesInput, U>(
	loadables: T,
	mapper: (values: LoadedValues<T>) => MaybeLoadable<U>
): PassthroughFrom<T> | MaybeLoadable<U> {
	const combined = combineLoadablesValue(loadables);
	if (!isLoaded(combined)) return combined as PassthroughFrom<T>;
	const loadedValue = combined.value as LoadedValues<T>;
	return mapper(loadedValue);
}

export function combineLoadablesReactive<T extends MaybeRefLoadablesInput>(
	loadables: T
): ComputedRef<Loadable<ResolvedLoadedValues<T>>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		return toRichLoadable(combined);
	});
}

export function mapLoadedReactive<T extends MaybeRefLoadablesInput, U>(
	loadables: T,
	mapper: (values: ResolvedLoadedValues<T>) => U
): ComputedRef<Loadable<U>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		if (!isLoaded(combined)) return toRichLoadable(combined as MaybeLoadable<U>);
		return Loadable.Loaded(mapper(combined.value as ResolvedLoadedValues<T>));
	});
}

export function flatMapLoadedReactive<T extends MaybeRefLoadablesInput, U>(
	loadables: T,
	mapper: (values: ResolvedLoadedValues<T>) => MaybeLoadable<U>
): ComputedRef<Loadable<U>> {
	return computed(() => {
		const combined = combineLoadablesValue(resolveMaybeRefLoadablesInput(loadables)) as MaybeLoadable<ResolvedLoadedValues<T>>;
		if (!isLoaded(combined)) return toRichLoadable(combined as MaybeLoadable<U>);
		const mapped = mapper(combined.value as ResolvedLoadedValues<T>);
		return toRichLoadable(mapped);
	});
}

export const mergeMapLoadedReactive = flatMapLoadedReactive;
export const switchMapLoadedReactive = flatMapLoadedReactive;
