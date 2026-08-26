import { unref, type DebuggerOptions, type MaybeRef, type UnwrapRef } from 'vue';

import { combine, combineOptional, type MaybeLoadable, type MaybeLoadablesArrayOrObject } from './loadable-combine';
import { Loadable } from './loadable-core';
import { createDerivedLoadable, type ControlledLoadable, type LoadableReactiveOptions, type MaybeRefLoadable } from './loadable-reactive';

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

type CombineReactiveOptions = LoadableReactiveOptions & { includeEmpty?: boolean; debuggerOptions?: DebuggerOptions };

export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T): ControlledLoadable<ResolvedLoadedValues<T>>;
export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(loadables: T, options: CombineReactiveOptions & { includeEmpty?: false }): ControlledLoadable<ResolvedLoadedValues<T>>;
export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(
	loadables: T,
	options: CombineReactiveOptions & { includeEmpty: true },
): ControlledLoadable<ResolvedLoadedValuesIncludingEmpty<T>>;
export function combineLoadables<T extends MaybeRefLoadablesArrayOrObject>(
	loadables: T,
	options: CombineReactiveOptions = {},
): ControlledLoadable<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>> {
	const { includeEmpty = false, debuggerOptions, ...reactiveOptions } = options;
	return createDerivedLoadable<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>>(
		() => (Array.isArray(loadables) ? loadables : Object.values(loadables)),
		() => {
			const resolved = unwrapLoadableRefs(loadables) as UnwrapLoadableRefs<T> & MaybeLoadablesArrayOrObject;
			return (includeEmpty ? combineOptional(resolved) : Loadable.wrap(combine(resolved))) as MaybeLoadable<ResolvedLoadedValues<T> | ResolvedLoadedValuesIncludingEmpty<T>>;
		},
		{ ...debuggerOptions, ...reactiveOptions },
	);
}
