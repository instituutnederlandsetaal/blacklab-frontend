import { unref, watchEffect, type MaybeRef, type UnwrapRef } from 'vue';

import { combineLoadablesValue, combineLoadablesValueIncludingEmpty, type MaybeLoadable, type MaybeLoadablesArrayOrObject } from './loadable-combine';
import { Loadable } from './loadable-core';
import { createDerivedLoadable, mapReactive, flatMapReactive, type ControlledLoadable, type MaybeRefLoadable } from './loadable-reactive';

type MaybeRefLoadablesArray = readonly MaybeRefLoadable<unknown>[];
type MaybeRefLoadablesObject = Record<string, MaybeRefLoadable<unknown>>;
type MaybeRefLoadablesArrayOrObject = MaybeRefLoadablesArray | MaybeRefLoadablesObject;

type UnwrapLoadableRefs<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: UnwrapRef<T[K]>;
};

type ResolvedLoadedValues<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: T[K] extends MaybeRef<MaybeLoadable<infer V>> ? V : never;
};

type ResolvedLoadedValuesIncludingEmpty<T extends MaybeRefLoadablesArrayOrObject> = {
	[K in keyof T]: T[K] extends MaybeRef<MaybeLoadable<infer V>> ? V | undefined : never;
};

/**
 * Given a set of loadables (or refs to loadables), unwraps the refs and returns a new object/array with the same structure, but containing the loadables themselves.
 * @param loadables
 * @returns
 */
export function unwrapLoadableRefs<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): UnwrapLoadableRefs<T> {
	if (Array.isArray(loadables)) {
		return loadables.map(v => unref(v)) as UnwrapLoadableRefs<T>;
	}
	return Object.fromEntries(Object.entries(loadables).map(([k, v]) => [k, unref(v)])) as UnwrapLoadableRefs<T>;
}

function resolveMaybeRefLoadablesInput<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): UnwrapLoadableRefs<T> & MaybeLoadablesArrayOrObject {
	return unwrapLoadableRefs(loadables) as UnwrapLoadableRefs<T> & MaybeLoadablesArrayOrObject;
}

function forEachResolvedLoadable(loadables: MaybeLoadablesArrayOrObject, callback: (loadable: MaybeLoadable<unknown>) => void) {
	(Array.isArray(loadables) ? loadables : Object.values(loadables)).forEach(callback);
}

export function combineReactive<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): ControlledLoadable<ResolvedLoadedValues<T>>;
export function combineReactive<T extends MaybeRefLoadablesArrayOrObject>(loadables: T, options: { includeEmpty: true }): ControlledLoadable<ResolvedLoadedValuesIncludingEmpty<T>>;
export function combineReactive<T extends MaybeRefLoadablesArrayOrObject>(
	loadables: T,
	options: { includeEmpty?: boolean } = {},
): ControlledLoadable<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>> {
	return createDerivedLoadable<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>>(
		applyLoadable =>
			watchEffect(() => {
				const resolved = resolveMaybeRefLoadablesInput(loadables);
				const combined = (options.includeEmpty ? combineLoadablesValueIncludingEmpty(resolved) : Loadable.wrap(combineLoadablesValue(resolved))) as MaybeLoadable<
					ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>
				>;
				applyLoadable(combined);
			}),
		() => {
			const resolved = resolveMaybeRefLoadablesInput(loadables);
			const retryables: MaybeLoadable<unknown>[] = [];
			forEachResolvedLoadable(resolved, loadable => retryables.push(loadable));
			return retryables;
		},
	);
}

export function combineOptionalReactive<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): ControlledLoadable<ResolvedLoadedValuesIncludingEmpty<T>> {
	return combineReactive(loadables, { includeEmpty: true });
}

export const combineLoadables = combineReactive;
export const combineLoadablesReactive = combineReactive;
export const mapLoadedReactive = mapReactive;
export const flatMapLoadedReactive = flatMapReactive;
