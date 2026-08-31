import { shallowReactive, shallowRef, watch, type Ref } from 'vue';

import { isLoaded, Loadable, LoadableState, withLoadableMethods, type Loadable as LoadableType } from './loadable-core';

export type RetryableLoadable<T> = LoadableType<T> & { retry(): void };

export function loadableReactiveFromSnapshot<T, E extends object>(snapshot: Readonly<Ref<LoadableType<T>>>, extra: E): LoadableType<T> & E {
	const r = shallowReactive({
		...(extra as E),
		get state() {
			return snapshot.value.state;
		},
		get value() {
			return snapshot.value.value;
		},
		get error() {
			return snapshot.value.error;
		},
	});
	return withLoadableMethods<T, Omit<LoadableType<T>, 'isLoading' | 'isLoaded' | 'isError' | 'isEmpty'> & E>(r);
}

/**
 * Mirror a loadable, but run a callback before publishing each
 * newly loaded value. The callback intentionally is not reactive, so it can be used to perform side effects without triggering additional reactive reads.
 */
export function tapLoadedReactive<T>(source: RetryableLoadable<T>, cb: (value: T) => void): RetryableLoadable<T> {
	const published = shallowRef<LoadableType<T>>(Loadable.Empty<T>());
	let hasCheckpointedValue = false;
	let checkpointedValue: T | undefined;

	watch(
		() => [source.state, source.value, source.error] as const,
		() => {
			if (!isLoaded(source)) {
				hasCheckpointedValue = false;
				checkpointedValue = undefined;
			} else if (!hasCheckpointedValue || !Object.is(checkpointedValue, source.value)) {
				cb(source.value);
				hasCheckpointedValue = true;
				checkpointedValue = source.value;
			}

			const next = Loadable.loadable(source.state, isLoaded(source) ? source.value : undefined, source.state === LoadableState.error ? source.error : undefined);
			if (published.value.state !== next.state || published.value.value !== next.value || published.value.error !== next.error) published.value = next;
		},
		{ immediate: true, flush: 'sync' },
	);

	return loadableReactiveFromSnapshot(published, {
		retry: () => source.retry(),
	});
}
