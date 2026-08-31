import { describe, expect, test, vi } from 'vitest';
import { nextTick, ref, watch, type Ref } from 'vue';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { combine, combineOptional } from '@/shared/utils/loadable/loadable-combine';
import { combineLoadables, unwrapLoadableRefs } from '@/shared/utils/loadable/loadable-combine-reactive';
import { Loadable, LoadableState, type LoadableLike } from '@/shared/utils/loadable/loadable-core';
import { loadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { loadableReactive } from '@/shared/utils/loadable/loadable-reactive';

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

	test('resolveMaybeRefLoadables unwraps refs and plain values', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);
		const resolved = unwrapLoadableRefs([a, b] as const);

		expect(resolved[0].state).toBe(LoadableState.loaded);
		expect(resolved[0].value).toBe(1);
		expect(resolved[1].state).toBe(LoadableState.loaded);
		expect(resolved[1].value).toBe(2);
	});

	test('resolveMaybeRefLoadables unwraps object inputs', () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Empty<number>();
		const resolved = unwrapLoadableRefs({ a, b });

		expect(resolved.a.state).toBe(LoadableState.loaded);
		expect(resolved.a.value).toBe(1);
		expect(resolved.b.state).toBe(LoadableState.empty);
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
	test('combines maybeRef loadables in arrays', async () => {
		const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const b = Loadable.Loaded(2);

		const combined = combineLoadables([a, b] as const);

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, 2]);

		a.value = Loadable.Loading();
		await nextTick();
		expect(combined.state).toBe(LoadableState.loading);
	});

	test('combines maybeRef loadables in objects', async () => {
		const a: Ref<Loadable<string>> = ref(Loadable.Loaded('x'));
		const b: Ref<Loadable<string>> = ref(Loadable.Loaded('y'));

		const combined = combineLoadables({ a, b });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual({ a: 'x', b: 'y' });

		b.value = Loadable.Empty();
		await nextTick();
		expect(combined.state).toBe(LoadableState.empty);
	});

	test('supports includeEmpty', () => {
		const loaded: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const empty: Ref<Loadable<number>> = ref(Loadable.Empty());

		const combined = combineLoadables([loaded, empty] as const, { includeEmpty: true });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, undefined]);
	});

	test('combineLoadables can include empty values', () => {
		const loaded: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
		const empty: Ref<Loadable<number>> = ref(Loadable.Empty());

		const combined = combineLoadables([loaded] as const);
		const optional = combineLoadables([loaded, empty] as const, { includeEmpty: true });

		expect(combined.value).toEqual([1]);
		expect(optional.value).toEqual([1, undefined]);
	});
});

describe('loadableFromLoadables', () => {
	test('keeps value hidden until every input is loaded and surfaces the first unsettled state', async () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([first.loadable, second.loadable] as const);

		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();
		expect(combined.error).toBeUndefined();

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		await nextTick();
		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();

		const failure = new ApiError('boom', 'boom', 'broken', 500);
		second.error.value = failure;
		second.state.value = LoadableState.error;
		await nextTick();
		expect(combined.state).toBe(LoadableState.error);
		expect(combined.error).toBe(failure);
		expect(combined.value).toBeUndefined();
	});

	test('fans out retry and stop to retryable inputs only', () => {
		const retryA = vi.fn<() => void>();
		const stopA = vi.fn<() => void>();
		const retryB = vi.fn<() => void>();
		const stopB = vi.fn<() => void>();
		const first = createControlledLoadable(Loadable.Loading<number>(), {
			retry: retryA,
			stop: stopA,
		});
		const second = createControlledLoadable(Loadable.Loading<number>(), {
			retry: retryB,
			stop: stopB,
		});
		const combined = combineLoadables([first.loadable, second.loadable, Loadable.Loaded(3)] as const);

		combined.retry();
		combined.stop();

		expect(retryA).toHaveBeenCalledTimes(1);
		expect(retryB).toHaveBeenCalledTimes(1);
		expect(stopA).toHaveBeenCalledTimes(1);
		expect(stopB).toHaveBeenCalledTimes(1);
	});

	test('fans out retry and stop once per unique retryable input', () => {
		const retry = vi.fn<() => void>();
		const stop = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loading<number>(), { retry, stop });
		const combined = combineLoadables([source.loadable, source.loadable] as const);

		combined.retry();
		combined.stop();

		expect(retry).toHaveBeenCalledTimes(1);
		expect(stop).toHaveBeenCalledTimes(1);
	});

	test('fans out retry through object inputs', () => {
		const retry = vi.fn<() => void>();
		const source = createControlledLoadable(Loadable.Loading<number>(), { retry });
		const combined = combineLoadables({ source: source.loadable });

		combined.retry();

		expect(retry).toHaveBeenCalledTimes(1);
	});

	test('supports treating empty inputs as settled', () => {
		const loaded = createControlledLoadable(Loadable.Loaded(1));
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const combined = combineLoadables([loaded.loadable, empty.loadable] as const, {
			includeEmpty: true,
		});

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual([1, undefined]);
		expect(combined.error).toBeUndefined();
	});

	test('supports treating empty object inputs as settled', () => {
		const loaded = createControlledLoadable(Loadable.Loaded(1));
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const combined = combineLoadables({ loaded: loaded.loadable, empty: empty.loadable }, { includeEmpty: true });

		expect(combined.state).toBe(LoadableState.loaded);
		expect(combined.value).toEqual({ loaded: 1, empty: undefined });
	});

	test('passes through unresolved states when treating empty inputs as settled', () => {
		const empty = createControlledLoadable(Loadable.Empty<number>());
		const loading = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([empty.loadable, loading.loadable] as const, {
			includeEmpty: true,
		});

		expect(combined.state).toBe(LoadableState.loading);
		expect(combined.value).toBeUndefined();
	});

	test('does not trigger watchers when an input settles but the exposed output stays the same', async () => {
		const first = createControlledLoadable(Loadable.Loading<number>());
		const second = createControlledLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([first.loadable, second.loadable] as const);
		const onStateChange = vi.fn<(value: LoadableState, oldValue: LoadableState | undefined) => void>();
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();

		watch(() => combined.state, onStateChange, { immediate: true, flush: 'sync' });
		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });

		first.value.value = 1;
		first.state.value = LoadableState.loaded;
		await nextTick();
		expect(onStateChange).toHaveBeenCalledTimes(1);
		expect(onValueChange).toHaveBeenCalledTimes(1);

		second.value.value = 2;
		second.state.value = LoadableState.loaded;
		await nextTick();
		expect(onStateChange).toHaveBeenCalledTimes(2);
		expect(onValueChange).toHaveBeenCalledTimes(2);
		expect(combined.value).toEqual([1, 2]);
	});

	test('reuses the combined loaded value when the underlying loaded values are unchanged', async () => {
		const shared = { id: 1 };
		const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const combined = combineLoadables([first, second] as const);
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();
		const initialValue = combined.value;

		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });

		first.value = Loadable.Loaded(shared);
		await nextTick();

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(combined.value).toBe(initialValue);
	});

	test('reuses object combined values only when entries are unchanged', async () => {
		const shared = { id: 1 };
		const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
		const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
		const combined = combineLoadables({ first, second });
		const initialValue = combined.value;

		first.value = Loadable.Loaded(shared);
		await nextTick();
		expect(combined.value).toBe(initialValue);

		first.value = Loadable.Loaded({ id: 1 });
		await nextTick();
		expect(combined.value).not.toBe(initialValue);
		expect(combined.value).toEqual({ first: { id: 1 }, second: 2 });
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
