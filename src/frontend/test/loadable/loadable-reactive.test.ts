import { describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, watch } from 'vue';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { combine, combineOptional } from '@/shared/utils/loadable/loadable-combine';
import { combineLoadables } from '@/shared/utils/loadable/loadable-combine-reactive';
import { Loadable, LoadableState, type LoadableLike } from '@/shared/utils/loadable/loadable-core';
import { loadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { loadableReactive, tapLoadedReactive } from '@/shared/utils/loadable/loadable-reactive';

function createControlledLoadable<T>(initial: Loadable<T>, extra: Partial<{ retry: () => void; stop: () => void }> = {}) {
	const state = ref(initial.state);
	const value = ref(initial.value);
	const error = ref(initial.error);

	return {
		state,
		value,
		error,
		loadable: loadableReactive(state, value, error, {
			retry: vi.fn<() => void>(),
			stop: vi.fn<() => void>(),
			...extra,
		}),
	};
}

function createDeferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const cancel = vi.fn<() => void>();
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return {
		request: new CancelableRequest(promise, cancel),
		resolve,
		reject,
		cancel,
	};
}

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

describe('non-reactive loadable primitives', () => {
	test('combine combines loaded arrays', () => {
		const result = combine([Loadable.Loaded(1), Loadable.Loaded(2)] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, 2]);
	});

	test('combine passes through first non-loaded state', () => {
		const result = combine([Loadable.Loaded(1), Loadable.Empty<number>(), Loadable.Loading()] as const);

		expect(result.state).toBe(LoadableState.empty);
	});

	test('combine accepts plain LoadableLike shape', () => {
		const a: LoadableLike<number> = { state: LoadableState.loaded, value: 1, error: undefined };
		const b: LoadableLike<number> = { state: LoadableState.loaded, value: 2, error: undefined };
		const result = combine([a, b] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, 2]);
	});

	test('combine passes through original non-loaded LoadableLike', () => {
		const loadingLike: LoadableLike<number> = {
			state: LoadableState.loading,
			value: undefined,
			error: undefined,
		};
		const result = combine([loadingLike, Loadable.Loaded(2)] as const);

		expect(result).toBe(loadingLike);
	});

	test('combine handles mixed plain values and loadables', () => {
		const result = combine([Loadable.Loaded(1), { plain: true }] as const);

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual([1, { plain: true }]);
	});

	test('combineOptional treats empty loadables as settled undefined', () => {
		const result = combineOptional({ value: Loadable.Empty<number>(), plain: 'x' });

		expect(result.state).toBe(LoadableState.loaded);
		expect(result.value).toEqual({ value: undefined, plain: 'x' });
	});
});

describe('combineLoadables', () => {
	test('publishes state, value, and error as atomic snapshots', async () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([first.loadable, second.loadable] as const);
		const snapshots: Array<readonly [LoadableState, readonly [number, number] | undefined, ApiError | undefined]> = [];
		watch(
			() => [combined.state, combined.value, combined.error] as const,
			snapshot => snapshots.push(snapshot),
			{ immediate: true, flush: 'sync' },
		);

		first.state.value = LoadableState.empty;
		await nextTick();

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		await nextTick();

		const failure = new ApiError('boom', 'boom', 'broken', 500);
		second.error.value = failure;
		second.state.value = LoadableState.error;
		await nextTick();

		second.error.value = undefined;
		second.value.value = 2;
		second.state.value = LoadableState.loaded;
		await nextTick();

		expect(snapshots).toEqual([
			[LoadableState.loading, undefined, undefined],
			[LoadableState.empty, undefined, undefined],
			[LoadableState.loading, undefined, undefined],
			[LoadableState.error, undefined, failure],
			[LoadableState.loaded, [1, 2], undefined],
		]);
	});

	test('fans out controls once per unique dependency and cleans up with its scope', () => {
		const retry = vi.fn<() => void>();
		const stop = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loading<number>(), { retry, stop });
		const scope = effectScope();
		const combined = scope.run(() => combineLoadables([source.loadable, source.loadable, Loadable.Loaded(3)] as const))!;

		combined.retry();
		scope.stop();
		combined.retry();

		expect(retry).toHaveBeenCalledTimes(1);
		expect(stop).toHaveBeenCalledTimes(1);
	});

	test('reuses array values when dependency identities are unchanged', async () => {
		const shared = { id: 1 };
		const first = createControlledLoadable(Loadable.Loaded(shared));
		const second = createControlledLoadable(Loadable.Loaded(2));
		const combined = combineLoadables([first.loadable, second.loadable] as const);
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();
		const initialValue = combined.value;

		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });
		first.error.value = new ApiError('ignored', 'ignored', 'ignored', 500);
		await nextTick();

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(combined.value).toBe(initialValue);
	});

	test('reuses object combined values only when entries are unchanged', async () => {
		const shared = { id: 1 };
		const first = createControlledLoadable(Loadable.Loaded(shared));
		const second = createControlledLoadable(Loadable.Loaded(2));
		const combined = combineLoadables({ first: first.loadable, second: second.loadable });
		const initialValue = combined.value;

		first.error.value = new ApiError('ignored', 'ignored', 'ignored', 500);
		await nextTick();
		expect(combined.value).toBe(initialValue);

		first.value.value = { id: 1 };
		await nextTick();
		expect(combined.value).not.toBe(initialValue);
		expect(combined.value).toEqual({ first: { id: 1 }, second: 2 });
	});
});

describe('tapLoadedReactive', () => {
	test('runs its callback synchronously before publishing without tracking callback reads', async () => {
		const source = createControlledLoadable(Loadable.Loading<number>());
		const incidental = ref(0);
		const events: string[] = [];
		const tapped = tapLoadedReactive(source.loadable, value => events.push(`checkpoint:${value}:${incidental.value}`));
		watch(
			() => tapped.value,
			value => events.push(`consumer:${value}`),
			{ flush: 'sync' },
		);

		source.value.value = 1;
		source.state.value = LoadableState.loaded;
		expect(events).toEqual(['checkpoint:1:0', 'consumer:1']);

		incidental.value = 1;
		await nextTick();
		expect(events).toEqual(['checkpoint:1:0', 'consumer:1']);
	});

	test('does not publish or retry after the checkpoint stops it', () => {
		const retry = vi.fn<() => void>();
		const stop = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loading<number>(), { retry, stop });
		let tapped!: ReturnType<typeof tapLoadedReactive<number>>;
		tapped = tapLoadedReactive(source.loadable, () => tapped.stop());

		source.value.value = 1;
		source.state.value = LoadableState.loaded;
		tapped.retry();

		expect(tapped.state).toBe(LoadableState.loading);
		expect(tapped.value).toBeUndefined();
		expect(retry).not.toHaveBeenCalled();
		expect(stop).toHaveBeenCalledTimes(1);
	});
});

describe('loadableFromRequest', () => {
	test('starts immediately and exposes the resolved value', async () => {
		const deferred = createDeferredRequest<number>();
		const makeRequest = vi.fn<() => CancelableRequest<number>>(() => deferred.request);

		const loadable = loadableFromRequest(makeRequest);

		expect(makeRequest).toHaveBeenCalledTimes(1);
		expect(loadable.state).toBe(LoadableState.loading);

		deferred.resolve(42);
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(42);

		loadable.stop();
		expect(deferred.cancel).not.toHaveBeenCalled();
	});

	test('stops an active request immediately and ignores its late result', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		loadable.stop();
		expect(deferred.cancel).toHaveBeenCalledTimes(1);
		expect(loadable.state).toBe(LoadableState.empty);

		deferred.resolve(42);
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.empty);
		expect(loadable.value).toBeUndefined();
	});

	test('wraps failed requests as ApiError values', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		deferred.reject(new Error('network failed'));
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.error);
		expect(loadable.value).toBeUndefined();
		expect(loadable.error).toBeInstanceOf(ApiError);
		expect(loadable.error?.message).toBe('network failed');
	});

	test('returns to empty when the request is cancelled through ApiError', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		deferred.reject(ApiError.CANCELLED);
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.empty);
		expect(loadable.value).toBeUndefined();
		expect(loadable.error).toBeUndefined();
	});

	test('returns to empty when the request is cancelled through axios', async () => {
		const deferred = createDeferredRequest<number>();
		const loadable = loadableFromRequest(() => deferred.request);

		deferred.reject({ __CANCEL__: true });
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.empty);
		expect(loadable.value).toBeUndefined();
		expect(loadable.error).toBeUndefined();
	});

	test('retry cancels and ignores stale request results', async () => {
		const first = createDeferredRequest<number>();
		const second = createDeferredRequest<number>();
		const makeRequest = vi.fn<() => CancelableRequest<number>>().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const loadable = loadableFromRequest(makeRequest);

		loadable.retry();

		expect(first.cancel).toHaveBeenCalledTimes(1);
		expect(makeRequest).toHaveBeenCalledTimes(2);

		first.resolve(1);
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.loading);

		second.resolve(2);
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(2);
	});

	test('retry ignores stale request errors', async () => {
		const first = createDeferredRequest<number>();
		const second = createDeferredRequest<number>();
		const makeRequest = vi.fn<() => CancelableRequest<number>>().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const loadable = loadableFromRequest(makeRequest);

		loadable.retry();
		first.reject(new Error('too late'));
		await flushPromises();

		expect(loadable.state).toBe(LoadableState.loading);
		expect(loadable.error).toBeUndefined();

		second.reject(new Error('current failed'));
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.error);
		expect(loadable.error?.message).toBe('current failed');
	});
});

describe('loadableReactive', () => {
	test('state check functions follow reactive refs', () => {
		const state = ref(LoadableState.loaded);
		const value = ref(42);
		const loadable = loadableReactive(state, value);

		expect(loadable.isLoaded()).toBe(true);
		expect(loadable.value).toBe(42);
		state.value = LoadableState.error;
		expect(loadable.isError()).toBe(true);
	});
});
