import { isLoaded, Loadable, type LoadableLike } from '@/_new/shared/utils/loadable/loadable';

export type MaybeLoadable<T> = LoadableLike<T> | Loadable<T>;
export type MaybeLoadablesArray = MaybeLoadable<unknown>[];
export type MaybeLoadablesObject = Record<string, MaybeLoadable<unknown>>;
export type MaybeLoadablesInput = MaybeLoadablesArray | MaybeLoadablesObject;

export type LoadablesArray = Loadable<unknown>[];
export type LoadablesObject = Record<string, Loadable<unknown>>;
export type LoadablesInput = LoadablesArray | LoadablesObject;

export type LoadedValues<T extends MaybeLoadablesInput> = {
	[K in keyof T]: T[K] extends MaybeLoadable<infer V> ? V : never;
};

export type PassthroughFrom<T extends MaybeLoadablesInput> = T extends MaybeLoadable<unknown>[] ? T[number] : T[keyof T];

/** Return the first non-loaded loadable from the passed in array or object. When used with an object, the order is not guaranteed (other than that basic key iteration order is preserved). */
export function firstNonLoaded<T extends MaybeLoadablesInput>(loadables: T): PassthroughFrom<T> | undefined {
	if (Array.isArray(loadables)) return loadables.find(v => !isLoaded(v)) as PassthroughFrom<T> | undefined;
	for (const key in loadables as MaybeLoadablesObject) {
		if (!isLoaded((loadables as MaybeLoadablesObject)[key])) return (loadables as MaybeLoadablesObject)[key] as PassthroughFrom<T>;
	}
	return undefined;
}

export function extractLoadedValues<T extends MaybeLoadablesInput>(loadables: T): LoadedValues<T> {
	if (Array.isArray(loadables)) {
		return loadables.map(v => v.value) as LoadedValues<T>;
	}
	return Object.fromEntries(Object.entries(loadables).map(([k, v]) => [k, v.value])) as LoadedValues<T>;
}

export function combineLoadablesValue<T extends LoadablesInput>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>>;
export function combineLoadablesValue<T extends MaybeLoadablesInput>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>>;
export function combineLoadablesValue<T extends MaybeLoadablesInput>(loadables: T): PassthroughFrom<T> | Loadable<LoadedValues<T>> {
	const nonLoaded = firstNonLoaded(loadables);
	if (nonLoaded) return nonLoaded;
	return Loadable.Loaded(extractLoadedValues(loadables));
}

/**
 * Given an array or object of loadables, if all are loaded, return the result of applying the mapper to the loaded values.
 * Otherwise, return the first non-loaded loadable (which could be Loading, Error or Empty).
 * @param loadables The array or object of loadables to map over.
 * @param mapper The function to apply to the loaded values. Only called if all loadables are loaded. Will receive an array or object of the loaded values, matching the structure of the input, e.g. ([T, U, V]) or {a: T, b: U, c: V}.
 */
export function mapLoadedValue<T extends LoadablesInput, U>(loadables: T, mapper: (values: LoadedValues<T>) => U): PassthroughFrom<T> | Loadable<U>;
export function mapLoadedValue<T extends MaybeLoadablesInput, U>(loadables: T, mapper: (values: LoadedValues<T>) => U): PassthroughFrom<T> | Loadable<U>;
export function mapLoadedValue<T extends MaybeLoadablesInput, U>(loadables: T, mapper: (values: LoadedValues<T>) => U): PassthroughFrom<T> | Loadable<U> {
	const combined = combineLoadablesValue(loadables);
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
export function flatMapLoadedValue<T extends LoadablesInput, U>(loadables: T, mapper: (values: LoadedValues<T>) => MaybeLoadable<U>): PassthroughFrom<T> | MaybeLoadable<U>;
export function flatMapLoadedValue<T extends MaybeLoadablesInput, U>(loadables: T, mapper: (values: LoadedValues<T>) => MaybeLoadable<U>): PassthroughFrom<T> | MaybeLoadable<U>;
export function flatMapLoadedValue<T extends MaybeLoadablesInput, U>(loadables: T, mapper: (values: LoadedValues<T>) => MaybeLoadable<U>): PassthroughFrom<T> | MaybeLoadable<U> {
	const combined = combineLoadablesValue(loadables);
	if (!isLoaded(combined)) return combined as PassthroughFrom<T>;
	const loadedValue = combined.value as LoadedValues<T>;
	return mapper(loadedValue);
}
