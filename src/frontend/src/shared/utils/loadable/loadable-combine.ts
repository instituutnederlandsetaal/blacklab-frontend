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

export type PassthroughFrom<T extends LoadableShape> = Extract<T extends readonly unknown[] ? T[number] : T[keyof T], MaybeLoadable<unknown>>;

function valuesOf<T extends LoadableShape>(loadables: T): unknown[] {
	return Array.isArray(loadables) ? [...loadables] : Object.values(loadables);
}

function mapShape<T extends LoadableShape>(loadables: T, mapper: (value: unknown) => unknown): { [K in keyof T]: unknown } {
	return (Array.isArray(loadables) ? loadables.map(mapper) : Object.fromEntries(Object.entries(loadables).map(([key, value]) => [key, mapper(value)]))) as { [K in keyof T]: unknown };
}

/** Return the first non-loaded loadable from the passed array or object. Plain values are considered settled. */
function firstNonLoaded<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | undefined {
	return valuesOf(loadables).find(v => isLoadableLike(v) && !isLoaded(v)) as PassthroughFrom<T> | undefined;
}

function extractLoadedValues<T extends LoadableShape>(loadables: T): LoadedValues<T> {
	return mapShape(loadables, v => (isLoadableLike(v) ? v.value : v)) as LoadedValues<T>;
}

/** Return the first loadable that is neither Loaded nor Empty. Empty values are considered settled. */
function firstNonLoadedOrEmpty<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | undefined {
	return valuesOf(loadables).find(v => isLoadableLike(v) && !isLoaded(v) && !isEmpty(v)) as PassthroughFrom<T> | undefined;
}

function extractLoadedValuesIncludingEmpty<T extends LoadableShape>(loadables: T): LoadedValuesIncludingEmpty<T> {
	return mapShape(loadables, v => (isLoadableLike(v) ? (isLoaded(v) ? v.value : undefined) : v)) as LoadedValuesIncludingEmpty<T>;
}

export function combine<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>> {
	const nonLoaded = firstNonLoaded(loadables);
	if (nonLoaded) return nonLoaded;
	return Loadable.Loaded(extractLoadedValues(loadables));
}

export function combineOptional<T extends LoadableShape>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValuesIncludingEmpty<T>> {
	const nonLoadedOrEmpty = firstNonLoadedOrEmpty(loadables);
	if (nonLoadedOrEmpty) return nonLoadedOrEmpty;
	return Loadable.Loaded(extractLoadedValuesIncludingEmpty(loadables));
}

/**
 * Given an array or object of loadables, if all are loaded, return the result of applying the mapper to the loaded values.
 * Otherwise, return the first non-loaded loadable (which could be Loading, Error or Empty).
 * @param loadables The array or object of loadables to map over.
 * @param mapper The function to apply to the loaded values. Only called if all loadables are loaded. Will receive an array or object of the loaded values, matching the structure of the input, e.g. ([T, U, V]) or {a: T, b: U, c: V}.
 */
export function mapLoadedValue<T extends LoadableShape, U>(loadables: T, mapper: (values: LoadedValues<T>) => U): PassthroughFrom<T> | Loadable<U> {
	const combined = combine(loadables);
	if (!isLoaded(combined)) return combined as PassthroughFrom<T>;
	const loadedValue = combined.value as LoadedValues<T>;
	return Loadable.Loaded(mapper(loadedValue));
}

/**
 * Given an array or object of loadables, if all are loaded, return the result of applying the mapper to the loaded values.
 * Otherwise, return the first non-loaded loadable (which could be Loading, Error or Empty).
 * @param loadables The array or object of loadables to map over.
 * @param mapper The function to apply to the loaded values. Should return a Loadable. Only called if all loadables are loaded. Will receive an array or object of the loaded values, matching the structure of the input, e.g. ([T, U, V]) or {a: T, b: U, c: V}.
 */
export function flatMapLoadedValue<T extends LoadableShape, U>(loadables: T, mapper: (values: LoadedValues<T>) => MaybeLoadable<U>): PassthroughFrom<T> | MaybeLoadable<U> {
	const combined = combine(loadables);
	if (!isLoaded(combined)) return combined as PassthroughFrom<T>;
	const loadedValue = combined.value as LoadedValues<T>;
	return mapper(loadedValue);
}
