import { isLoadable, isLoaded, Loadable } from './loadable-core';

type Shape = readonly unknown[] | Record<string, unknown>;
type LoadedValues<T extends Shape> = { [K in keyof T]: T[K] extends Loadable<infer V> ? V : T[K] };

/** Preserve the first pending, empty, or failed dependency. Otherwise unwrap the whole shape. */
export function combine<T extends Shape>(inputs: T): Loadable<LoadedValues<T>> {
	const values: unknown[] = Object.values(inputs);
	for (const value of values) {
		if (isLoadable(value) && !isLoaded(value)) return value as Loadable<never>;
	}
	const unwrap = (value: unknown) => (isLoadable(value) ? value.value : value);
	const result = Array.isArray(inputs) ? inputs.map(unwrap) : Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, unwrap(value)]));
	return Loadable.Loaded(result as LoadedValues<T>);
}
