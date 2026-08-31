import { shallowRef, watch } from 'vue';

import { combine, type LoadedValues, type MaybeLoadable, type MaybeLoadablesArrayOrObject } from './loadable-combine';
import { isLoaded, Loadable, LoadableState, type Loadable as LoadableType } from './loadable-core';
import { loadableReactiveFromSnapshot, type RetryableLoadable } from './loadable-reactive';

function forEachUniqueRetryable(loadables: readonly MaybeLoadable<unknown>[], callback: (loadable: RetryableLoadable<unknown>) => void) {
	const seen = new Set<MaybeLoadable<unknown>>();
	for (const loadable of loadables) {
		if (seen.has(loadable)) continue;
		seen.add(loadable);
		if (typeof (loadable as Partial<RetryableLoadable<unknown>>).retry === 'function') callback(loadable as RetryableLoadable<unknown>);
	}
}

function reuseValue<T>(previous: T | undefined, next: T): T {
	if (Array.isArray(previous) && Array.isArray(next)) return previous.length === next.length && previous.every((value, index) => Object.is(value, next[index])) ? previous : next;
	if (previous && typeof previous === 'object' && typeof next === 'object') {
		const previousEntries = Object.entries(previous as Record<string, unknown>);
		const nextEntries = Object.entries(next as Record<string, unknown>);
		if (previousEntries.length === nextEntries.length && nextEntries.every(([key, value], index) => previousEntries[index]?.[0] === key && Object.is(previousEntries[index][1], value)))
			return previous;
	}
	return next;
}

export function combineLoadables<T extends MaybeLoadablesArrayOrObject>(loadables: T): RetryableLoadable<LoadedValues<T>> {
	const dependencies: readonly MaybeLoadable<unknown>[] = Array.isArray(loadables) ? loadables : Object.values(loadables);
	const published = shallowRef<LoadableType<LoadedValues<T>>>(Loadable.Empty());
	watch(
		() => dependencies.map(loadable => [loadable.state, loadable.value, loadable.error] as const),
		() => {
			const result = combine(loadables);
			const next = Loadable.loadable(
				result.state,
				isLoaded(result) ? reuseValue(published.value.value, result.value as LoadedValues<T>) : undefined,
				result.state === LoadableState.error ? result.error : undefined,
			);
			if (published.value.state !== next.state || published.value.value !== next.value || published.value.error !== next.error) published.value = next;
		},
		{ immediate: true },
	);

	return loadableReactiveFromSnapshot(published, {
		retry: () => forEachUniqueRetryable(dependencies, loadable => loadable.retry()),
	});
}
