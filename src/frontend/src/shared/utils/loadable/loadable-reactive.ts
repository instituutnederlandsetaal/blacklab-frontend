import { tryOnScopeDispose } from '@vueuse/core';
import { reactive, ref, shallowReactive, shallowRef, toRef, unref, watch, type DebuggerOptions, type MaybeRef, type Ref, type WatchOptions } from 'vue';

import type { MaybeLoadable } from './loadable-combine';
import { isLoaded, Loadable, LoadableState, withLoadableMethods, type Loadable as LoadableType, type LoadableLike } from './loadable-core';

import type { ApiError } from '@/shared/api/lib/api-types';

export type MaybeRefLoadable<T> = MaybeRef<MaybeLoadable<T>>;
export type LoadableReactiveOptions = DebuggerOptions & { deep?: boolean };
type ReactiveLoadableControls = { retry: () => void; stop: () => void };
export type ReactiveLoadable<T> = LoadableType<T>;
export type ControlledLoadable<T> = ReactiveLoadable<T> & ReactiveLoadableControls;

type WritableLoadableRefs<T> = {
	state: Ref<LoadableState>;
	value: Ref<T | undefined>;
	error: Ref<ApiError | undefined>;
};

function isRetryableLoadable<T>(loadable: MaybeLoadable<T>): loadable is ControlledLoadable<T> {
	return typeof (loadable as Partial<ControlledLoadable<T>>).retry === 'function' && typeof (loadable as Partial<ControlledLoadable<T>>).stop === 'function';
}

function forEachUniqueRetryableLoadable(loadables: (MaybeLoadable<unknown> | undefined)[], callback: (loadable: ControlledLoadable<unknown>) => void) {
	const seen = new Set<MaybeLoadable<unknown>>();
	for (const loadable of loadables) {
		if (!loadable || seen.has(loadable)) continue;
		seen.add(loadable);
		if (isRetryableLoadable(loadable)) callback(loadable);
	}
}

type DerivedLoadableOptions = LoadableReactiveOptions & Pick<WatchOptions, 'flush'>;
type LoadableDependency = MaybeRefLoadable<unknown>;
type LoadableDependencySnapshot = readonly [loadable: MaybeLoadable<unknown>, state: LoadableState, value: unknown, error: ApiError | undefined];

function watchLoadableDependencies(getDependencies: () => readonly LoadableDependency[], callback: (dependencies: MaybeLoadable<unknown>[]) => void, options: DerivedLoadableOptions = {}) {
	return watch(
		() =>
			getDependencies().map(dependency => {
				const loadable = unref(dependency) as MaybeLoadable<unknown>;
				return [loadable, loadable.state, loadable.value, loadable.error] as LoadableDependencySnapshot;
			}),
		snapshots => callback(snapshots.map(([loadable]) => loadable)),
		{ immediate: true, ...options },
	);
}

function reuseLoadableValueIfUnchanged<T>(previousValue: T | undefined, nextValue: T | undefined): T | undefined {
	if (previousValue == null || nextValue == null) return nextValue;

	if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
		return previousValue.length === nextValue.length && previousValue.every((value, index) => Object.is(value, nextValue[index])) ? previousValue : nextValue;
	}

	if (typeof previousValue === 'object' && typeof nextValue === 'object') {
		const previousEntries = Object.entries(previousValue as Record<string, unknown>);
		const nextEntries = Object.entries(nextValue as Record<string, unknown>);
		return previousEntries.length === nextEntries.length && nextEntries.every(([key, value], index) => previousEntries[index]?.[0] === key && Object.is(previousEntries[index]?.[1], value))
			? previousValue
			: nextValue;
	}

	return nextValue;
}

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

function loadableSnapshot<T>(loadable: MaybeLoadable<T>, previous?: LoadableLike<T>): LoadableLike<T> {
	const nextState = loadable.state;
	const nextValue = isLoaded(loadable) ? reuseLoadableValueIfUnchanged(previous?.value, loadable.value) : undefined;
	const nextError = nextState === LoadableState.error ? loadable.error : undefined;
	return { state: nextState, value: nextValue, error: nextError };
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
 * Recompute a loadable from an explicit set of reactive loadable dependencies.
 * The derivation runs in the watch callback, so reactive reads inside it are not
 * collected. Its current result is watched separately to support flat maps.
 */
export function createDerivedLoadable<T>(getDependencies: () => readonly LoadableDependency[], derive: () => MaybeRefLoadable<T>, options: DerivedLoadableOptions = {}): ControlledLoadable<T> {
	const published = shallowRef<LoadableLike<T>>(Loadable.Empty<T>());
	const publish = (loadable: MaybeLoadable<T>) => {
		const next = loadableSnapshot(loadable, published.value);
		if (Object.is(published.value.state, next.state) && Object.is(published.value.value, next.value) && Object.is(published.value.error, next.error)) return;
		// One ref assignment makes state/value/error a single observable transition,
		// including for consumers using flush: 'sync'.
		published.value = next;
	};

	let currentDependencies: MaybeLoadable<unknown>[] = [];
	let currentResult: MaybeLoadable<T> | undefined;
	let stopWatchingResult = () => {};
	let stopped = false;

	const stopResult = (replacement?: MaybeLoadable<unknown>) => {
		stopWatchingResult();
		stopWatchingResult = () => {};
		if (currentResult && currentResult !== replacement && !currentDependencies.includes(currentResult) && isRetryableLoadable(currentResult)) currentResult.stop();
		currentResult = undefined;
	};

	const stopWatchingDependencies = watchLoadableDependencies(
		getDependencies,
		dependencies => {
			currentDependencies = dependencies;
			const result = derive();
			const initialResult = unref(result) as MaybeLoadable<T>;
			stopResult(initialResult);
			stopWatchingResult = watchLoadableDependencies(
				() => [result],
				([nextResult]) => {
					if (currentResult && currentResult !== nextResult && !currentDependencies.includes(currentResult) && isRetryableLoadable(currentResult)) currentResult.stop();
					currentResult = nextResult as MaybeLoadable<T>;
					publish(currentResult);
				},
				options,
			);
		},
		options,
	);

	const stop = () => {
		if (stopped) return;
		stopped = true;
		stopWatchingDependencies();
		stopWatchingResult();
		forEachUniqueRetryableLoadable([...currentDependencies, currentResult], loadable => loadable.stop());
	};

	tryOnScopeDispose(stop);

	return loadableReactiveFromSnapshot<T, ReactiveLoadableControls>(published, {
		retry() {
			forEachUniqueRetryableLoadable([...currentDependencies, currentResult], loadable => loadable.retry());
		},
		stop,
	}) as ControlledLoadable<T>;
}

/**
 * Mirror a loadable, but run a callback before publishing each
 * newly loaded value. The callback intentionally is not reactive, so it can be used to perform side effects without triggering additional reactive reads.
 */
export function tapLoadedReactive<T>(source: ControlledLoadable<T>, cb: (value: T) => void, options?: LoadableReactiveOptions): ControlledLoadable<T> {
	let hasCheckpointedValue = false;
	let checkpointedValue: T | undefined;

	return createDerivedLoadable<T>(
		() => [source],
		() => {
			if (!isLoaded(source)) {
				hasCheckpointedValue = false;
				checkpointedValue = undefined;
			} else if (!hasCheckpointedValue || !Object.is(checkpointedValue, source.value)) {
				cb(source.value);
				hasCheckpointedValue = true;
				checkpointedValue = source.value;
			}
			return source;
		},
		{ ...options, flush: 'sync' },
	);
}
