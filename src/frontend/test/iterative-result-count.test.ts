import { afterEach, describe, expect, test, vi } from 'vitest';
import { watch } from 'vue';

import { IterativeResultCountLoader, type TotalsInput } from '@/api/async/logic/result-count/result-count-from-query';
import type { BLSearchResult } from '@/types/blacklabtypes';

import { ApiError, type BlackLabApi, CancelableRequest } from '@/shared/api/lib/api-types';

type SearchState = 'counting' | 'finished' | 'limited';
type PendingRequest = {
	cancel: ReturnType<typeof vi.fn>;
	reject: (reason: unknown) => void;
	request: CancelableRequest<BLSearchResult>;
	resolve: (result: BLSearchResult) => void;
};

function result(state: SearchState, count: number): BLSearchResult {
	const stats = {
		documents: count,
		hits: count,
		status: state === 'counting' ? ('working' as const) : ('finished' as const),
		stoppedBecauseTooMany: state === 'limited',
		timeMs: count,
	};
	return {
		docInfos: {},
		hits: [],
		summary: {
			params: { number: 0, patt: '[]' },
			results: {
				sample: { percentage: undefined, sample: undefined, seed: undefined },
				stats: {
					counted: stats,
					largestGroupSize: undefined,
					numberOfGroups: undefined,
					processed: stats,
					subcorpusSize: { documents: count, tokens: count * 10 },
				},
				window: { actualSize: 0, firstResult: 0, hasNext: false, hasPrevious: false, requestedSize: 0 },
			},
		},
	} as BLSearchResult;
}

function pendingRequest(): PendingRequest {
	let resolve!: PendingRequest['resolve'];
	let reject!: PendingRequest['reject'];
	const promise = new Promise<BLSearchResult>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	const cancel = vi.fn();
	return { cancel, reject, request: new CancelableRequest(promise, cancel), resolve };
}

function apiHarness() {
	const hitRequests: PendingRequest[] = [];
	const docRequests: PendingRequest[] = [];
	const getHits = vi.fn(() => {
		const pending = pendingRequest();
		hitRequests.push(pending);
		return pending.request;
	});
	const getDocs = vi.fn(() => {
		const pending = pendingRequest();
		docRequests.push(pending);
		return pending.request;
	});
	return { api: { getDocs, getHits } as unknown as BlackLabApi, docRequests, getDocs, getHits, hitRequests };
}

function input(results: BLSearchResult, operation: TotalsInput['operation'] = 'hits'): TotalsInput {
	return { annotatedFieldId: 'contents', indexId: 'corpus', operation, results };
}

async function settleRequest() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('IterativeResultCountLoader', () => {
	test('uses one polling pipeline and publishes every intermediate response through the terminal response', async () => {
		vi.useFakeTimers();
		const harness = apiHarness();
		const initial = result('counting', 1);
		const intermediate = result('counting', 2);
		const finished = result('finished', 3);
		const loader = new IterativeResultCountLoader(input(initial), harness.api, { intervalMs: 100, timeoutMs: 1000 });
		const updates: BLSearchResult[] = [];
		const stop = watch(
			() => loader.value,
			value => value && updates.push(value.results),
			{ flush: 'sync' },
		);

		expect(loader.value?.results).toBe(initial);
		expect(loader.value?.state).toBe('counting');
		expect(harness.getHits).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(100);
		expect(harness.getHits).toHaveBeenCalledOnce();
		expect(harness.getHits).toHaveBeenCalledWith('corpus', expect.objectContaining({ first: 0, number: 0, patt: '[]', subcorpussize: true }));

		harness.hitRequests[0].resolve(intermediate);
		await settleRequest();
		expect(loader.value?.results).toBe(intermediate);

		await vi.advanceTimersByTimeAsync(100);
		expect(harness.getHits).toHaveBeenCalledTimes(2);
		harness.hitRequests[1].resolve(finished);
		await settleRequest();

		expect(loader.value?.results).toBe(finished);
		expect(loader.value?.state).toBe('finished');
		expect(updates).toEqual([intermediate, finished]);
		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.getHits).toHaveBeenCalledTimes(2);

		stop();
		loader.dispose();
	});

	test('pauses the latest counting total on timeout and cancels the active request', async () => {
		vi.useFakeTimers();
		const harness = apiHarness();
		const intermediate = result('counting', 2);
		const loader = new IterativeResultCountLoader(input(result('counting', 1)), harness.api, { intervalMs: 100, timeoutMs: 250 });

		await vi.advanceTimersByTimeAsync(100);
		harness.hitRequests[0].resolve(intermediate);
		await settleRequest();
		await vi.advanceTimersByTimeAsync(100);
		expect(harness.getHits).toHaveBeenCalledTimes(2);
		expect(harness.hitRequests[1].cancel).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(50);
		expect(harness.hitRequests[1].cancel).toHaveBeenCalledOnce();
		expect(loader.value?.results).toBe(intermediate);
		expect(loader.value?.state).toBe('paused');
		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.getHits).toHaveBeenCalledTimes(2);

		loader.dispose();
	});

	test.each(['finished', 'limited'] as const)('leaves an initially %s total terminal without polling or duplicating it', async state => {
		vi.useFakeTimers();
		const harness = apiHarness();
		const initial = result(state, 3);
		const loader = new IterativeResultCountLoader(input(initial), harness.api, { intervalMs: 100, timeoutMs: 250 });

		expect(loader.value?.results).toBe(initial);
		expect(loader.value?.state).toBe(state);
		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.getHits).not.toHaveBeenCalled();
		expect(loader.value?.state).toBe(state);

		loader.dispose();
	});

	test('keeps request errors terminal and retries from the initial result', async () => {
		vi.useFakeTimers();
		const harness = apiHarness();
		const initial = result('counting', 1);
		const loader = new IterativeResultCountLoader(input(initial), harness.api, { intervalMs: 100, timeoutMs: 1000 });
		const error = new ApiError('Failed', 'Could not count', 'Server error', 500);

		await vi.advanceTimersByTimeAsync(100);
		harness.hitRequests[0].reject(error);
		await settleRequest();
		expect(loader.isError()).toBe(true);
		expect(loader.error).toBe(error);
		expect(loader.value).toBeUndefined();

		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.getHits).toHaveBeenCalledOnce();
		loader.continueCounting();
		expect(loader.value?.results).toBe(initial);
		expect(loader.error).toBeUndefined();

		await vi.advanceTimersByTimeAsync(100);
		expect(harness.getHits).toHaveBeenCalledTimes(2);
		harness.hitRequests[1].resolve(result('finished', 3));
		await settleRequest();
		expect(loader.value?.state).toBe('finished');

		loader.dispose();
	});

	test('switching and disposal cancel superseded timers and requests', async () => {
		vi.useFakeTimers();
		const harness = apiHarness();
		const loader = new IterativeResultCountLoader(input(result('counting', 1)), harness.api, { intervalMs: 100, timeoutMs: 1000 });

		await vi.advanceTimersByTimeAsync(50);
		loader.next(input(result('counting', 2)));
		await vi.advanceTimersByTimeAsync(50);
		expect(harness.getHits).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(50);
		expect(harness.getHits).toHaveBeenCalledOnce();

		loader.next(input(result('counting', 3)));
		expect(harness.hitRequests[0].cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(100);
		expect(harness.getHits).toHaveBeenCalledTimes(2);

		loader.dispose();
		expect(harness.hitRequests[1].cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		expect(harness.getHits).toHaveBeenCalledTimes(2);
	});

	test('polls the document endpoint for document totals', async () => {
		vi.useFakeTimers();
		const harness = apiHarness();
		const loader = new IterativeResultCountLoader(input(result('counting', 1), 'docs'), harness.api, { intervalMs: 100 });

		await vi.advanceTimersByTimeAsync(100);
		expect(harness.getDocs).toHaveBeenCalledOnce();
		expect(harness.getHits).not.toHaveBeenCalled();

		loader.dispose();
		expect(harness.docRequests[0].cancel).toHaveBeenCalledOnce();
	});
});
