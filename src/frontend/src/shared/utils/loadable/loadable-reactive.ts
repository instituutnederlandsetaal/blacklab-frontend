import { tryOnScopeDispose } from '@vueuse/core';
import { reactive, ref, shallowReactive, shallowRef, toRef, watch, type MaybeRef, type Ref } from 'vue';

import { isLoaded, Loadable, LoadableState, withLoadableMethods, type Loadable as LoadableType, type LoadableLike } from './loadable-core';

import type { ApiError } from '@/shared/api/lib/api-types';

type ReactiveLoadableControls = { retry: () => void; stop: () => void };
export type ReactiveLoadable<T> = LoadableType<T>;
export type ControlledLoadable<T> = ReactiveLoadable<T> & ReactiveLoadableControls;

type WritableLoadableRefs<T> = {
	state: Ref<LoadableState>;
	value: Ref<T | undefined>;
	error: Ref<ApiError | undefined>;
};

function reactiveLoadableFromRefs<T, E extends object>(refs: WritableLoadableRefs<T>, extra: E): ReactiveLoadable<T> & E {
	const r = reactive({
		...(extra as E),
		state: refs.state,
		value: refs.value,
		error: refs.error,
	});
	return withLoadableMethods<T, LoadableLike<T> & E>(r as LoadableLike<T> & E);
}

export function loadableReactiveFromSnapshot<T, E extends object>(snapshot: Readonly<Ref<LoadableLike<T>>>, extra: E): ReactiveLoadable<T> & E {
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
	return withLoadableMethods<T, LoadableLike<T> & E>(r as LoadableLike<T> & E);
}

export const loadableReactive = <T, E extends object = {}>(
	state: MaybeRef<LoadableState>,
	value?: MaybeRef<T | undefined>,
	error?: MaybeRef<ApiError | undefined>,
	extra?: E,
): ReactiveLoadable<T> & E => {
	return reactiveLoadableFromRefs<T, E>(
		{
			state: toRef(state) as Ref<LoadableState>,
			value: (value == null ? ref<T>() : toRef(value)) as Ref<T | undefined>,
			error: (error == null ? ref<ApiError>() : toRef(error)) as Ref<ApiError | undefined>,
		},
		extra as E,
	);
};

/**
 * Mirror a loadable, but run a callback before publishing each
 * newly loaded value. The callback intentionally is not reactive, so it can be used to perform side effects without triggering additional reactive reads.
 */
export function tapLoadedReactive<T>(source: ControlledLoadable<T>, cb: (value: T) => void): ControlledLoadable<T> {
	const published = shallowRef<LoadableLike<T>>(Loadable.Empty<T>());
	let hasCheckpointedValue = false;
	let checkpointedValue: T | undefined;
	let stopped = false;

	const stopWatching = watch(
		() => [source.state, source.value, source.error] as const,
		() => {
			if (!isLoaded(source)) {
				hasCheckpointedValue = false;
				checkpointedValue = undefined;
			} else if (!hasCheckpointedValue || !Object.is(checkpointedValue, source.value)) {
				cb(source.value);
				if (stopped) return;
				hasCheckpointedValue = true;
				checkpointedValue = source.value;
			}

			const next: LoadableLike<T> = {
				state: source.state,
				value: isLoaded(source) ? source.value : undefined,
				error: source.state === LoadableState.error ? source.error : undefined,
			};
			if (published.value.state !== next.state || published.value.value !== next.value || published.value.error !== next.error) published.value = next;
		},
		{ immediate: true, flush: 'sync' },
	);
	const stop = () => {
		if (stopped) return;
		stopped = true;
		stopWatching();
		source.stop();
	};
	tryOnScopeDispose(stop);

	return loadableReactiveFromSnapshot(published, {
		retry: () => {
			if (!stopped) source.retry();
		},
		stop,
	});
}
