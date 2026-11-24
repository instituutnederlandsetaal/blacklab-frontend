import { flushPromises } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, watch } from 'vue';

import { ApiError } from '@/shared/api/lib/api-types';
import { useRequestResource, type RequestLike, type RequestResource, type RequestResourceState, type RequestRun } from '@/shared/utils/loadable/loadable-request-resource';

function deferred<T>(cancel = vi.fn<() => void>()) {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return {
		request: Object.assign(promise, { cancel }) as RequestLike<T>,
		resolve,
		reject,
		cancel,
	};
}

describe('useRequestResource ownership', () => {
	test('replacement cancels the prior request and suppresses its non-cooperative settlement', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const request = vi.fn<(input: number) => RequestLike<number>>().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const resource = useRequestResource(request);

		resource.run(1);
		resource.run(2);
		expect(first.cancel).toHaveBeenCalledOnce();

		first.resolve(1);
		await flushPromises();
		expect(resource.state.value.loading).toBe(true);

		second.resolve(2);
		await flushPromises();
		expect(resource.state.value.loading).toBe(false);
		expect(resource.state.value.settled.value).toBe(2);
	});

	test('cancel suppresses a late plain Promise and never publishes cancellation as Error', async () => {
		const pending = deferred<number>();
		const plainPromise = pending.request.then(value => value);
		const resource = useRequestResource(() => plainPromise);

		resource.run(undefined);
		resource.cancel();
		pending.resolve(1);
		await flushPromises();

		expect(resource.state.value.loading).toBe(false);
		expect(resource.state.value.settled.isEmpty()).toBe(true);
	});

	test('a newer run started by the transport during cancellation wins', async () => {
		const first = deferred<number>();
		const request = vi.fn((input: number) => (input === 1 ? first.request : Promise.resolve(input)));
		const resource = useRequestResource(request);
		first.cancel.mockImplementation(() => resource.run(3));

		resource.run(1);
		resource.run(2);
		await flushPromises();

		expect(request.mock.calls.map(([input]) => input)).toEqual([1, 3]);
		expect(resource.current.value.value).toBe(3);
	});

	test.each([ApiError.CANCELLED, { __CANCEL__: true }])('treats transport cancellation as empty', async reason => {
		const cancelled = deferred<number>();
		const cancellation = useRequestResource(() => cancelled.request);
		cancellation.run(undefined);
		cancelled.reject(reason);
		await flushPromises();
		expect(cancellation.current.value.isEmpty()).toBe(true);
	});

	test('catches synchronous factory errors', () => {
		const failure = useRequestResource<void, number>(() => {
			throw new Error('factory failed');
		});
		failure.run();
		expect(failure.state.value.settled.error?.message).toBe('factory failed');
	});

	test('cancel is reusable while reset also forgets the retry input', async () => {
		const pending = [deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request);
		const resource = useRequestResource(request);

		resource.run(1);
		resource.cancel();
		resource.retry();
		expect(request).toHaveBeenCalledTimes(2);
		resource.reset();
		resource.retry();
		expect(request).toHaveBeenCalledTimes(2);
	});
});

describe('useRequestResource reactive triggering', () => {
	test('batches key changes, ignores equal keys, and resets on null', async () => {
		const source = ref<{ id: number; incidental?: boolean } | null>({ id: 1 });
		const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request).mockReturnValueOnce(pending[2].request);
		const resource = useRequestResource(request, { source, key: input => input.id });

		source.value!.incidental = true;
		expect(request).toHaveBeenCalledOnce();
		source.value = { id: 1 };
		await nextTick();
		expect(request).toHaveBeenCalledOnce();
		expect(pending[0].cancel).not.toHaveBeenCalled();
		source.value.id = 2;
		expect(pending[0].cancel).toHaveBeenCalledOnce();
		source.value.id = 1;
		expect(request).toHaveBeenCalledOnce();
		await nextTick();
		expect(request).toHaveBeenCalledTimes(2);
		source.value.id = 2;
		source.value = null;
		expect(resource.state.value.settled.isEmpty()).toBe(true);
		expect(pending[1].cancel).toHaveBeenCalledOnce();
		await nextTick();
		expect(request).toHaveBeenCalledTimes(2);
		source.value = { id: 2 };
		await nextTick();
		expect(request).toHaveBeenCalledTimes(3);
	});

	test('invalidates synchronously so a later imperative run in the same tick wins', async () => {
		const source = ref(1);
		const pending = [deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request);
		const resource = useRequestResource(request, { source });

		source.value = 2;
		expect(pending[0].cancel).toHaveBeenCalledOnce();
		resource.run(10);
		await nextTick();
		expect(request.mock.calls.map(call => call[0])).toEqual([1, 10]);
		expect(pending[1].cancel).not.toHaveBeenCalled();

		pending[0].resolve(1);
		await flushPromises();
		expect(resource.state.value.loading).toBe(true);
		pending[1].resolve(10);
		await flushPromises();
		expect(resource.state.value.settled.value).toBe(10);
	});
});

describe('RequestRun and lifecycle', () => {
	test('a failed child cancels its pending sibling and preserves the original error', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const resource = useRequestResource((_input, run) => Promise.all([run.wait(first.request), run.wait(second.request)]));

		resource.run();
		first.reject(new Error('metadata failed'));
		await flushPromises();

		expect(second.cancel).toHaveBeenCalledOnce();
		expect(first.cancel).not.toHaveBeenCalled();
		expect(resource.current.value.error?.message).toBe('metadata failed');
	});

	test('cancels dynamically-created requests across sequential waits', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const reachedSecond = vi.fn();
		const resource = useRequestResource<void, number>(async (_input, run: RequestRun) => {
			const value = await run.wait(first.request);
			run.signal.throwIfAborted();
			reachedSecond();
			return value + (await run.wait(second.request));
		});

		resource.run();
		first.resolve(1);
		await flushPromises();
		expect(reachedSecond).toHaveBeenCalledOnce();
		resource.cancel();
		expect(second.cancel).toHaveBeenCalledOnce();
	});

	test.each(['manual', 'reactive'] as const)('a checkpoint blocks mutation after child fulfillment (%s cancellation)', async mode => {
		const child = deferred<number>();
		const mutate = vi.fn();
		const source = ref<number | null>(1);
		const resource = useRequestResource<number, number>(
			async (_input, run) => {
				const value = await run.wait(child.request);
				run.signal.throwIfAborted();
				mutate();
				return value;
			},
			mode === 'reactive' ? { source } : undefined,
		);

		if (mode === 'manual') resource.run(1);
		child.resolve(1);
		queueMicrotask(() => (mode === 'manual' ? resource.cancel() : (source.value = null)));
		await flushPromises();
		expect(mutate).not.toHaveBeenCalled();
	});

	test.each(['running', 'queued'])('scope disposal cancels %s work and terminally blocks later runs', async work => {
		const pending = deferred<number>();
		const request = vi.fn(() => pending.request);
		const source = ref(1);
		let resource!: RequestResource<number, number>;
		const scope = effectScope();
		scope.run(() => {
			resource = useRequestResource(request, { source });
		});

		if (work === 'queued') source.value = 2;
		scope.stop();
		expect(pending.cancel).toHaveBeenCalledOnce();
		resource.run(3);
		pending.resolve(1);
		await flushPromises();
		expect(request).toHaveBeenCalledOnce();
		expect(resource.state.value).toMatchObject({ loading: false, settled: { value: undefined, error: undefined } });
		expect(resource.state.value.settled.isEmpty()).toBe(true);
	});

	test('publishes atomic loading and settlement snapshots while retaining the prior settlement', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const request = vi.fn().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const resource = useRequestResource<void, number>(request);
		const snapshots: RequestResourceState<number>[] = [];
		watch(resource.state, state => snapshots.push(state), { flush: 'sync' });

		resource.run();
		first.resolve(1);
		await flushPromises();
		resource.run();
		expect(resource.state.value.loading).toBe(true);
		expect(resource.state.value.settled.value).toBe(1);
		expect(resource.current.value.isLoading()).toBe(true);
		expect(resource.current.value.value).toBeUndefined();
		second.reject(new Error('nope'));
		await flushPromises();
		expect(resource.state.value.loading).toBe(false);
		expect(resource.state.value.settled.error?.message).toBe('nope');
		expect(snapshots.map(({ loading, settled }) => [loading, settled.value, settled.error?.message])).toEqual([
			[true, undefined, undefined],
			[false, 1, undefined],
			[true, 1, undefined],
			[false, undefined, 'nope'],
		]);
	});
});
