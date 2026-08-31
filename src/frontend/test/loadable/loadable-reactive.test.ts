import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';
import { nextTick, ref, shallowRef, watch } from 'vue';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { combine, combineOptional } from '@/shared/utils/loadable/loadable-combine';
import { combineLoadables } from '@/shared/utils/loadable/loadable-combine-reactive';
import { Loadable, LoadableState } from '@/shared/utils/loadable/loadable-core';
import { loadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { loadableReactiveFromSnapshot, tapLoadedReactive } from '@/shared/utils/loadable/loadable-reactive';
import { loadableFromStream } from '@/shared/utils/loadable/loadable-stream';

function createRetryableLoadable<T>(initial: Loadable<T>, retry = vi.fn<() => void>()) {
	const snapshot = shallowRef(initial);
	return {
		snapshot,
		loadable: loadableReactiveFromSnapshot(snapshot, { retry }),
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

	test('normalizes a real Loading as async state and a raw lookalike as loaded domain data', () => {
		const loading = Loadable.Loading<number>();
		const lookalike = { state: LoadableState.loading, value: undefined, error: undefined };
		const stream = new Subject<typeof loading | typeof lookalike>();
		const normalized = loadableFromStream(stream);

		expect(Loadable.wrap(loading)).toBe(loading);
		expect(Loadable.wrap(lookalike)).toMatchObject({ state: LoadableState.loaded, value: lookalike });
		expect(combine([loading, lookalike])).toBe(loading);
		expect(combine([lookalike])).toMatchObject({ state: LoadableState.loaded, value: [lookalike] });
		stream.next(loading);
		expect(normalized.isLoading()).toBe(true);
		stream.next(lookalike);
		expect(normalized.isLoaded() && normalized.value).toBe(lookalike);
		stream.complete();
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
		const first = createRetryableLoadable(Loadable.Loading<number>());
		const second = createRetryableLoadable(Loadable.Loading<number>());
		const combined = combineLoadables([first.loadable, second.loadable] as const);
		const snapshots: Array<readonly [LoadableState, readonly [number, number] | undefined, ApiError | undefined]> = [];
		watch(
			() => [combined.state, combined.value, combined.error] as const,
			snapshot => snapshots.push(snapshot),
			{ immediate: true, flush: 'sync' },
		);

		first.snapshot.value = Loadable.Empty();
		await nextTick();

		first.snapshot.value = Loadable.Loaded(1);
		await nextTick();

		const failure = new ApiError('boom', 'boom', 'broken', 500);
		second.snapshot.value = Loadable.LoadingError(failure);
		await nextTick();

		second.snapshot.value = Loadable.Loaded(2);
		await nextTick();

		expect(snapshots).toEqual([
			[LoadableState.loading, undefined, undefined],
			[LoadableState.empty, undefined, undefined],
			[LoadableState.loading, undefined, undefined],
			[LoadableState.error, undefined, failure],
			[LoadableState.loaded, [1, 2], undefined],
		]);
	});

	test('forwards retry once per unique retryable dependency', () => {
		const firstRetry = vi.fn<() => void>();
		const secondRetry = vi.fn<() => void>();
		const first = createRetryableLoadable(Loadable.Loading<number>(), firstRetry);
		const second = createRetryableLoadable(Loadable.Loaded(2), secondRetry);
		const combined = combineLoadables([first.loadable, first.loadable, Loadable.Loaded(3), second.loadable] as const);

		combined.retry();

		expect(firstRetry).toHaveBeenCalledOnce();
		expect(secondRetry).toHaveBeenCalledOnce();
	});

	test('reuses array values when dependency identities are unchanged', async () => {
		const shared = { id: 1 };
		const first = createRetryableLoadable(Loadable.Loaded(shared));
		const second = createRetryableLoadable(Loadable.Loaded(2));
		const combined = combineLoadables([first.loadable, second.loadable] as const);
		const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();
		const initialValue = combined.value;

		watch(() => combined.value, onValueChange, { immediate: true, flush: 'sync' });
		first.snapshot.value = Loadable.Loaded(shared);
		await nextTick();

		expect(onValueChange).toHaveBeenCalledTimes(1);
		expect(combined.value).toBe(initialValue);
	});

	test('reuses object combined values only when entries are unchanged', async () => {
		const shared = { id: 1 };
		const first = createRetryableLoadable(Loadable.Loaded(shared));
		const second = createRetryableLoadable(Loadable.Loaded(2));
		const combined = combineLoadables({ first: first.loadable, second: second.loadable });
		const initialValue = combined.value;

		first.snapshot.value = Loadable.Loaded(shared);
		await nextTick();
		expect(combined.value).toBe(initialValue);

		first.snapshot.value = Loadable.Loaded({ id: 1 });
		await nextTick();
		expect(combined.value).not.toBe(initialValue);
		expect(combined.value).toEqual({ first: { id: 1 }, second: 2 });
	});
});

describe('tapLoadedReactive', () => {
	test('runs its callback synchronously before publishing without tracking callback reads', async () => {
		const source = createRetryableLoadable(Loadable.Loading<number>());
		const incidental = ref(0);
		const events: string[] = [];
		const tapped = tapLoadedReactive(source.loadable, value => events.push(`checkpoint:${value}:${incidental.value}`));
		watch(
			() => tapped.value,
			value => events.push(`consumer:${value}`),
			{ flush: 'sync' },
		);

		source.snapshot.value = Loadable.Loaded(1);
		expect(events).toEqual(['checkpoint:1:0', 'consumer:1']);

		incidental.value = 1;
		await nextTick();
		expect(events).toEqual(['checkpoint:1:0', 'consumer:1']);
	});

	test('blocks publication when the callback throws', () => {
		const source = createRetryableLoadable(Loadable.Loading<number>());
		const failure = new Error('checkpoint failed');
		const tapped = tapLoadedReactive(source.loadable, () => {
			throw failure;
		});

		expect(() => (source.snapshot.value = Loadable.Loaded(1))).toThrow(failure);
		expect(tapped.state).toBe(LoadableState.loading);
		expect(tapped.value).toBeUndefined();
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
