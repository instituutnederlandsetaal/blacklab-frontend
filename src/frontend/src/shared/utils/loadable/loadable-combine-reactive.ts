import { tryOnScopeDispose } from '@vueuse/core';
import { shallowRef, watch } from 'vue';

import { combine, type LoadedValues, type MaybeLoadable, type MaybeLoadablesArrayOrObject } from './loadable-combine';
import { isLoaded, Loadable, LoadableState, type LoadableLike } from './loadable-core';
import { loadableReactiveFromSnapshot, type ControlledLoadable } from './loadable-reactive';

function forEachUniqueControlled(loadables: readonly MaybeLoadable<unknown>[], callback: (loadable: ControlledLoadable<unknown>) => void) {
	const seen = new Set<MaybeLoadable<unknown>>();
	for (const loadable of loadables) {
		if (seen.has(loadable)) continue;
		seen.add(loadable);
		if (typeof (loadable as Partial<ControlledLoadable<unknown>>).retry === 'function' && typeof (loadable as Partial<ControlledLoadable<unknown>>).stop === 'function') {
			callback(loadable as ControlledLoadable<unknown>);
		}
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

export function combineLoadables<T extends MaybeLoadablesArrayOrObject>(loadables: T): ControlledLoadable<LoadedValues<T>> {
	const dependencies: readonly MaybeLoadable<unknown>[] = Array.isArray(loadables) ? loadables : Object.values(loadables);
	const published = shallowRef<LoadableLike<LoadedValues<T>>>(Loadable.Empty());
	let stopped = false;
	const stopWatching = watch(
		() => dependencies.map(loadable => [loadable.state, loadable.value, loadable.error] as const),
		() => {
			const result = combine(loadables);
			const next: LoadableLike<LoadedValues<T>> = {
				state: result.state,
				value: isLoaded(result) ? reuseValue(published.value.value, result.value as LoadedValues<T>) : undefined,
				error: result.state === LoadableState.error ? result.error : undefined,
			};
			if (published.value.state !== next.state || published.value.value !== next.value || published.value.error !== next.error) published.value = next;
		},
		{ immediate: true },
	);
	const stop = () => {
		if (stopped) return;
		stopped = true;
		stopWatching();
		forEachUniqueControlled(dependencies, loadable => loadable.stop());
	};
	tryOnScopeDispose(stop);

	return loadableReactiveFromSnapshot(published, {
		retry: () => {
			if (!stopped) forEachUniqueControlled(dependencies, loadable => loadable.retry());
		},
		stop,
	});
}
