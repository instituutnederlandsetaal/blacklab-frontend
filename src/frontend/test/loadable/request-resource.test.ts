import { describe, expect, test, vi } from 'vitest';
import { effectScope, ref, watch } from 'vue';

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

async function flushPromises() {
	await Promise.resolve();
	await Promise.resolve();
}

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
		expect(resource.state.value.loading).toBe(true);

		second.resolve(2);
		await flushPromises();
		expect(resource.state.value.loading).toBe(false);
		expect(resource.state.value.settled.value).toBe(2);
	});

	test('cancel suppresses a late plain Promise and never publishes cancellation as Error', async () => {
		const pending = deferred<number>();
		const plainPromise = pending.request.then(value => value);
		const resource = useRequestResource({
			mode: 'manual',
			request: () => plainPromise,
		});

		resource.run(undefined);
		resource.cancel();
		expect('cancel' in plainPromise).toBe(false);
		pending.resolve(1);
		await flushPromises();

		expect(resource.state.value.loading).toBe(false);
		expect(resource.state.value.settled.isEmpty()).toBe(true);
	});

	test('distinguishes request cancellation from failures and catches synchronous factory errors', async () => {
		const cancelled = deferred<number>();
		const cancellation = useRequestResource({
			mode: 'manual',
			request: () => cancelled.request,
		});
		cancellation.run(undefined);
		cancelled.reject(ApiError.CANCELLED);
		await flushPromises();
		expect(cancellation.state.value.settled.isEmpty()).toBe(true);

		const failure = useRequestResource<void, number>({
			mode: 'manual',
			request: () => {
				throw new Error('factory failed');
			},
		});
		failure.run();
		expect(failure.state.value.settled.error?.message).toBe('factory failed');
	});

	test('cancel is reusable while reset also forgets the retry input', async () => {
		const pending = [deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request);
		const resource = useRequestResource({ mode: 'manual', request });

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
	test('tracks semantic keys in place, suppresses equal replacements, and resets on null', () => {
		const source = ref<{ id: number; incidental?: boolean } | null>({ id: 1 });
		const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request).mockReturnValueOnce(pending[2].request);
		const resource = useRequestResource({
			mode: 'reactive',
			source,
			key: input => input.id,
			request,
		});

		source.value!.incidental = true;
		expect(request).toHaveBeenCalledOnce();
		source.value = { id: 1 };
		expect(request).toHaveBeenCalledOnce();
		source.value.id = 2;
		expect(request).toHaveBeenCalledTimes(2);
		source.value = null;
		expect(resource.state.value.settled.isEmpty()).toBe(true);
		source.value = { id: 2 };
		expect(request).toHaveBeenCalledTimes(3);
	});

	test('invalidates synchronously so a later imperative run in the same tick wins', async () => {
		const source = ref(1);
		const pending = [deferred<number>(), deferred<number>(), deferred<number>()];
		const request = vi.fn().mockReturnValueOnce(pending[0].request).mockReturnValueOnce(pending[1].request).mockReturnValueOnce(pending[2].request);
		const resource = useRequestResource({ mode: 'reactive', source, request });

		source.value = 2;
		expect(pending[0].cancel).toHaveBeenCalledOnce();
		resource.run(10);
		expect(pending[1].cancel).toHaveBeenCalledOnce();
		expect(request.mock.calls.map(call => call[0])).toEqual([1, 2, 10]);

		pending[1].resolve(2);
		await flushPromises();
		expect(resource.state.value.loading).toBe(true);
		pending[2].resolve(10);
		await flushPromises();
		expect(resource.state.value.settled.value).toBe(10);
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
				run.throwIfAborted();
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
	});

	test('a checkpoint blocks mutation when cancellation was queued after child fulfillment', async () => {
		const child = deferred<number>();
		const mutate = vi.fn();
		const resource = useRequestResource<void, number>({
			mode: 'manual',
			request: async (_input, run) => {
				const value = await run.wait(child.request);
				run.throwIfAborted();
				mutate();
				return value;
			},
		});

		resource.run();
		child.resolve(1);
		queueMicrotask(() => resource.cancel());
		await flushPromises();
		expect(mutate).not.toHaveBeenCalled();
	});

	test('scope disposal cancels work and terminally blocks later runs', async () => {
		const pending = deferred<number>();
		let resource!: RequestResource<void, number>;
		const scope = effectScope();
		scope.run(() => {
			resource = useRequestResource({
				mode: 'manual',
				request: () => pending.request,
			});
			resource.run();
		});

		scope.stop();
		expect(pending.cancel).toHaveBeenCalledOnce();
		resource.run();
		expect(resource.state.value.settled.isEmpty()).toBe(true);
	});

	test('publishes atomic loading and settlement snapshots while retaining the prior settlement', async () => {
		const first = deferred<number>();
		const second = deferred<number>();
		const request = vi.fn().mockReturnValueOnce(first.request).mockReturnValueOnce(second.request);
		const resource = useRequestResource<void, number>({
			mode: 'manual',
			request,
		});
		const snapshots: RequestResourceState<number>[] = [];
		watch(resource.state, state => snapshots.push(state), { flush: 'sync' });

		resource.run();
		first.resolve(1);
		await flushPromises();
		resource.run();
		expect(resource.state.value.loading).toBe(true);
		expect(resource.state.value.settled.value).toBe(1);
		second.reject(new Error('nope'));
		await flushPromises();
		expect(resource.state.value.loading).toBe(false);
		expect(resource.state.value.settled.error?.message).toBe('nope');
		expect(snapshots).toHaveLength(4);
	});
});
