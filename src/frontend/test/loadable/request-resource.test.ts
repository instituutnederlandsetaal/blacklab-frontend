import { afterEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, watch } from 'vue';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { LoadableState } from '@/shared/utils/loadable/loadable-core';
import { loadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { resourceLoadable, useRequestResource, type RequestLike, type RequestResource, type RequestResourceState, type RequestRun } from '@/shared/utils/loadable/loadable-request-resource';

function deferred<T>(cancel = vi.fn<() => void>()) {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { request: Object.assign(promise, { cancel }) as RequestLike<T>, resolve, reject, cancel };
}

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe('useRequestResource ownership', () => {
	test('replacement cancels the prior request and suppresses its non-cooperative settlement', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const request = vi.fn<(input: number) => RequestLike<number>>().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const resource = useRequestResource({ mode: 'manual', request });

		resource.run(1);
		resource.run(2);
		expect(first.cancel).toHaveBeenCalledOnce();

		first.resolve(1);
		await flushPromises();
		expect(resource.state.value.phase).toBe('loading');

		second.resolve(2);
		await flushPromises();
		expect(resource.state.value).toEqual({ phase: 'loaded', data: 2, error: undefined, showLoading: false });
	});

	test('cancel suppresses a late plain Promise and never publishes cancellation as Error', async () => {
		const pending = deferred<number>();
		const plainPromise = pending.request.then(value => value);
		const resource = useRequestResource({ mode: 'manual', request: () => plainPromise });

		resource.run(undefined);
		resource.cancel();
		expect('cancel' in plainPromise).toBe(false);
		pending.resolve(1);
		await flushPromises();

		expect(resource.state.value).toEqual({ phase: 'empty', data: undefined, error: undefined, showLoading: false });
	});

	test('distinguishes request cancellation from failures and catches synchronous factory errors', async () => {
		const cancelled = deferred<number>();
		const cancellation = useRequestResource({ mode: 'manual', request: () => cancelled.request });
		cancellation.run(undefined);
		cancelled.reject(ApiError.CANCELLED);
		await flushPromises();
		expect(cancellation.state.value.phase).toBe('empty');

		const failure = useRequestResource<void, number>({
			mode: 'manual',
			request: () => {
				throw new Error('factory failed');
			},
		});
		failure.run();
		expect(failure.state.value.phase).toBe('error');
		expect(failure.state.value.error?.message).toBe('factory failed');
	});
});

describe('useRequestResource triggering', () => {
	test('reactive mode honors immediate, semantic keys, null reset, and later key reuse', async () => {
		const source = ref<{ id: number } | null>({ id: 1 });
		const requests: Array<ReturnType<typeof deferred<number>>> = [];
		const request = vi.fn((input: { id: number }) => {
			const pending = deferred<number>();
			requests.push(pending);
			return pending.request;
		});
		const resource = useRequestResource({ mode: 'reactive', source, immediate: false, key: input => input.id, request });

		expect(request).not.toHaveBeenCalled();
		source.value = { id: 1 };
		await nextTick();
		expect(request).not.toHaveBeenCalled();

		source.value = { id: 2 };
		await nextTick();
		expect(request).toHaveBeenCalledOnce();
		source.value = null;
		await nextTick();
		expect(requests[0].cancel).toHaveBeenCalledOnce();
		expect(resource.state.value.phase).toBe('empty');

		source.value = { id: 2 };
		await nextTick();
		expect(request).toHaveBeenCalledTimes(2);
	});

	test('reactive mode starts immediately by default and changed source keys replace imperative runs', async () => {
		const source = ref(1);
		const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request).mockReturnValueOnce(pending[2].request);
		const resource = useRequestResource({ mode: 'reactive', source, request });

		expect(request).toHaveBeenCalledWith(1, expect.anything());
		resource.run(10);
		expect(pending[0].cancel).toHaveBeenCalledOnce();
		source.value = 2;
		await nextTick();
		expect(pending[1].cancel).toHaveBeenCalledOnce();
		expect(request.mock.calls.map(call => call[0])).toEqual([1, 10, 2]);
	});

	test('publishes Loading before debounce and retry bypasses the pending delay', () => {
		vi.useFakeTimers();
		const request = vi.fn(() => deferred<number>().request);
		const resource = useRequestResource({ mode: 'manual', debounceMs: 100, request });

		resource.run(1);
		expect(resource.state.value.phase).toBe('loading');
		expect(request).not.toHaveBeenCalled();
		resource.retry();
		expect(request).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(100);
		expect(request).toHaveBeenCalledOnce();
	});
});

describe('useRequestResource retained data', () => {
	test('keeps data independently from delayed loading visibility and error retention', async () => {
		vi.useFakeTimers();
		const first = deferred<number>();
		const second = deferred<number>();
		const request = vi.fn().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const resource = useRequestResource({ mode: 'manual', keepPrevious: true, loadingIndicatorDelayMs: 50, request });

		resource.run(undefined);
		first.resolve(1);
		await flushPromises();
		resource.run(undefined);
		expect(resource.state.value).toEqual({ phase: 'loading', data: 1, error: undefined, showLoading: false });
		vi.advanceTimersByTime(50);
		expect(resource.state.value.showLoading).toBe(true);

		second.reject(new Error('nope'));
		await flushPromises();
		expect(resource.state.value.phase).toBe('error');
		expect(resource.state.value.data).toBeUndefined();
	});

	test('can retain data only on error without restoring it on cancel', async () => {
		const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request).mockReturnValueOnce(pending[2].request);
		const resource = useRequestResource({ mode: 'manual', keepPreviousOnError: true, request });

		resource.run(undefined);
		pending[0].resolve(1);
		await flushPromises();
		resource.run(undefined);
		expect(resource.state.value.data).toBeUndefined();
		pending[1].reject(new Error('nope'));
		await flushPromises();
		expect(resource.state.value.data).toBe(1);

		resource.retry();
		resource.cancel();
		expect(resource.state.value.phase).toBe('empty');
	});

	test('cancel restores retained Loading data while reset always clears it', async () => {
		const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request).mockReturnValueOnce(pending[2].request);
		const resource = useRequestResource({ mode: 'manual', keepPrevious: true, request });

		resource.run(undefined);
		pending[0].resolve(1);
		await flushPromises();
		resource.run(undefined);
		resource.cancel();
		expect(resource.state.value).toEqual({ phase: 'loaded', data: 1, error: undefined, showLoading: false });

		resource.run(undefined);
		resource.reset();
		expect(resource.state.value.phase).toBe('empty');
		expect(resource.state.value.data).toBeUndefined();
	});
});

describe('RequestRun and lifecycle', () => {
	test('cancels dynamically-created requests across sequential waits', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const reachedSecond = vi.fn();
		const resource = useRequestResource<void, number>({
			mode: 'manual',
			request: async (_input, run: RequestRun) => {
				const value = await run.wait(first.request);
				reachedSecond();
				return value + (await run.wait(second.request));
			},
		});

		resource.run();
		first.resolve(1);
		await flushPromises();
		expect(reachedSecond).toHaveBeenCalledOnce();
		resource.cancel();
		expect(second.cancel).toHaveBeenCalledOnce();
		second.resolve(2);
		await flushPromises();
		expect(resource.state.value.phase).toBe('empty');
	});

	test('abort suppresses continuation after an already-resolved child', async () => {
		const continued = vi.fn();
		const resource = useRequestResource<void, number>({
			mode: 'manual',
			request: async (_input, run) => {
				await run.wait(Promise.resolve(1));
				continued();
				return 2;
			},
		});

		resource.run();
		resource.cancel();
		await flushPromises();
		expect(continued).not.toHaveBeenCalled();
	});

	test('scope disposal cancels work and terminally blocks late publication', async () => {
		const pending = deferred<number>();
		let resource!: RequestResource<void, number>;
		const scope = effectScope();
		scope.run(() => {
			resource = useRequestResource({ mode: 'manual', request: () => pending.request });
			resource.run();
		});

		scope.stop();
		expect(pending.cancel).toHaveBeenCalledOnce();
		pending.resolve(1);
		await flushPromises();
		expect(resource.state.value.phase).toBe('empty');
		resource.run();
		expect(resource.state.value.phase).toBe('empty');
	});

	test('publishes one atomic snapshot and the Loadable adapter drops stale data', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const request = vi.fn().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const resource = useRequestResource({ mode: 'manual', keepPrevious: true, keepPreviousOnError: true, request });
		const loadable = resourceLoadable(resource);
		const snapshots = vi.fn<(state: RequestResourceState<number>) => void>();
		watch(resource.state, snapshots, { flush: 'sync' });

		resource.run(undefined);
		first.resolve(1);
		await flushPromises();
		resource.run(undefined);
		expect(resource.state.value.data).toBe(1);
		expect(loadable.value.state).toBe(LoadableState.loading);
		expect(loadable.value.value).toBeUndefined();
		second.reject(new Error('nope'));
		await flushPromises();
		expect(resource.state.value.data).toBe(1);
		expect(loadable.value.state).toBe(LoadableState.error);
		expect(loadable.value.value).toBeUndefined();
		expect(snapshots).toHaveBeenCalledTimes(4);
	});
});

describe('loadableFromRequest compatibility', () => {
	test('stop remains reusable and retry starts the last request again', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const makeRequest = vi
			.fn<() => CancelableRequest<number>>()
			.mockReturnValueOnce(new CancelableRequest(first.request as Promise<number>, first.cancel))
			.mockReturnValueOnce(new CancelableRequest(second.request as Promise<number>, second.cancel));
		const loadable = loadableFromRequest(makeRequest);

		loadable.stop();
		expect(loadable.state).toBe(LoadableState.empty);
		loadable.retry();
		second.resolve(2);
		await flushPromises();
		expect(loadable.state).toBe(LoadableState.loaded);
		expect(loadable.value).toBe(2);
	});
});
