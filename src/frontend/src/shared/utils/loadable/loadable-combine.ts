import { isEmpty, isLoadableLike, isLoaded, Loadable, type LoadableLike } from './loadable-core';

export type MaybeLoadable<T> = LoadableLike<T> | Loadable<T>;
type LoadableShapeArray = readonly unknown[];
type LoadableShapeObject = Record<string, unknown>;
export type LoadableShape = LoadableShapeArray | LoadableShapeObject;
type MaybeLoadablesArray = readonly MaybeLoadable<unknown>[];
type MaybeLoadablesObject = Record<string, MaybeLoadable<unknown>>;
export type MaybeLoadablesArrayOrObject = MaybeLoadablesArray | MaybeLoadablesObject;

export type LoadedValues<T extends LoadableShape> = {
	[K in keyof T]: T[K] extends MaybeLoadable<infer V> ? V : T[K];
};

export type LoadedValuesIncludingEmpty<T extends LoadableShape> = {
	[K in keyof T]: T[K] extends MaybeLoadable<infer V> ? V | undefined : T[K];
};

type PassthroughFrom<T extends LoadableShape> = Extract<T extends readonly unknown[] ? T[number] : T[keyof T], MaybeLoadable<unknown>>;

/** Read array and record loadable shapes through one ordered value view. */
function valuesOf<T extends LoadableShape>(loadables: T): unknown[] {
	return Array.isArray(loadables) ? [...loadables] : Object.values(loadables);
}

/** Map loadable arrays and records without changing their outer shape. */
function mapShape<T extends LoadableShape>(loadables: T, mapper: (value: unknown) => unknown): { [K in keyof T]: unknown } {
	return (Array.isArray(loadables) ? loadables.map(mapper) : Object.fromEntries(Object.entries(loadables).map(([key, value]) => [key, mapper(value)]))) as { [K in keyof T]: unknown };
}

/** Return the first non-loaded loadable from the passed array or object. Plain values are considered settled. */
function firstNonLoaded<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | undefined {
	return valuesOf(loadables).find(v => isLoadableLike(v) && !isLoaded(v)) as PassthroughFrom<T> | undefined;
}

/** Return the first loadable that is neither Loaded nor Empty. Empty values are considered settled. */
function firstNonLoadedOrEmpty<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | undefined {
	return valuesOf(loadables).find(v => isLoadableLike(v) && !isLoaded(v) && !isEmpty(v)) as PassthroughFrom<T> | undefined;
}

export function combine<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>> {
	const nonLoaded = firstNonLoaded(loadables);
	if (nonLoaded) return nonLoaded;
	return Loadable.Loaded(mapShape(loadables, value => (isLoadableLike(value) ? value.value : value)) as LoadedValues<T>);
}

export function combineOptional<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValuesIncludingEmpty<T>> {
	const nonLoadedOrEmpty = firstNonLoadedOrEmpty(loadables);
	if (nonLoadedOrEmpty) return nonLoadedOrEmpty;
	return Loadable.Loaded(mapShape(loadables, value => (isLoadableLike(value) ? (isLoaded(value) ? value.value : undefined) : value)) as LoadedValuesIncludingEmpty<T>);
}
