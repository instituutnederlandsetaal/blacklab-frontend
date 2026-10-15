// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { ExecutedSearchRequest } from '@/features/search/model/results/result-types';
import type { BLDocResults, BLHitGroupResults, BLHitResults } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

import ResultTotals from '@/pages/search/results/ResultTotals.vue';

function result(count = 1, status: 'working' | 'finished' = 'working'): BLHitResults {
	const stats = { documents: count, hits: count, status, stoppedBecauseTooMany: false, timeMs: 1 };
	return {
		hits: [],
		docInfos: {},
		summary: {
			params: { number: 0, patt: '[]' },
			results: {
				window: { actualSize: 0, firstResult: 0, hasNext: false, hasPrevious: false, requestedSize: 0 },
				stats: {
					counted: stats,
					processed: stats,
					largestGroupSize: undefined,
					numberOfGroups: undefined,
					subcorpusSize: {
						documents: 10,
						tokens: 100,
						annotatedFields: [{ fieldName: 'parallel', documents: 10, tokens: 200 }],
					},
				},
				sample: { percentage: undefined, sample: undefined, seed: undefined },
			},
		},
	};
}

function pendingRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: ApiError) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	const cancel = vi.fn();
	return { cancel, reject, request: new CancelableRequest(promise, cancel), resolve };
}

let api: ReturnType<typeof createMockApi>;
let hitRequests: ReturnType<typeof pendingRequest<BLHitResults>>[];
let docRequests: ReturnType<typeof pendingRequest<BLDocResults>>[];

beforeEach(() => {
	vi.useFakeTimers();
	api = createMockApi();
	hitRequests = [];
	docRequests = [];
	api.blacklabApi.getHits.mockImplementation(() => {
		const pending = pendingRequest<BLHitResults>();
		hitRequests.push(pending);
		return pending.request;
	});
	api.blacklabApi.getDocs.mockImplementation(() => {
		const pending = pendingRequest<BLDocResults>();
		docRequests.push(pending);
		return pending.request;
	});
});

afterEach(() => vi.useRealTimers());

describe('ResultTotals', () => {
	test('cancels replaced and unmounted counts and uses the current request and field', async () => {
		const initialRequest: ExecutedSearchRequest = { operation: 'hits', params: { number: 20, patt: '[]' } };
		const wrapper = shallowMount(ResultTotals, {
			global: { plugins: [api] },
			props: { annotatedFieldId: 'contents', executedRequest: initialRequest, indexId: 'first', initialResults: result() },
		});
		expect(wrapper.get('.totals-text').attributes('title')).toContain('100');
		await vi.advanceTimersByTimeAsync(1000);
		expect(api.blacklabApi.getHits).toHaveBeenLastCalledWith('first', { first: 0, number: 0, patt: '[]' });

		await wrapper.setProps({ annotatedFieldId: 'parallel' });
		expect(hitRequests[0].cancel).toHaveBeenCalledOnce();
		expect(wrapper.get('.totals-text').attributes('title')).toContain('200');
		await vi.advanceTimersByTimeAsync(1000);
		expect(hitRequests).toHaveLength(2);

		await wrapper.setProps({ indexId: 'second' });
		expect(hitRequests[1].cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		expect(api.blacklabApi.getHits).toHaveBeenLastCalledWith('second', { first: 0, number: 0, patt: '[]' });

		await wrapper.setProps({ executedRequest: { operation: 'hits', params: { number: 20, patt: '[word="water"]' } } });
		expect(hitRequests[2].cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		expect(api.blacklabApi.getHits).toHaveBeenLastCalledWith('second', { first: 0, number: 0, patt: '[word="water"]' });

		await wrapper.setProps({ initialResults: result(2) });
		expect(hitRequests[3].cancel).toHaveBeenCalledOnce();
		expect(wrapper.get('.totals-count').text()).toContain('2');
		await vi.advanceTimersByTimeAsync(1000);
		expect(hitRequests).toHaveLength(5);

		await wrapper.setProps({ executedRequest: { operation: 'docs', params: { number: 20, filter: 'year:2020' } }, initialResults: { docs: [], summary: result(2).summary } });
		expect(hitRequests[4].cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		expect(api.blacklabApi.getDocs).toHaveBeenCalledExactlyOnceWith('second', { first: 0, number: 0, filter: 'year:2020' });
		expect(docRequests[0].cancel).not.toHaveBeenCalled();

		wrapper.unmount();
		expect(docRequests[0].cancel).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(20000);
		expect(hitRequests).toHaveLength(5);
		expect(docRequests).toHaveLength(1);
	});

	test('emits counted results but not initial, errored, or stale responses', async () => {
		const wrapper = shallowMount(ResultTotals, {
			global: { plugins: [api] },
			props: { annotatedFieldId: 'contents', executedRequest: { operation: 'hits', params: { number: 20, patt: '[]' } }, indexId: 'first', initialResults: result() },
		});
		expect(wrapper.emitted('update')).toBeUndefined();

		const firstPoll = result(2);
		await vi.advanceTimersByTimeAsync(1000);
		hitRequests[0].resolve(firstPoll);
		await vi.advanceTimersByTimeAsync(0);
		const secondPoll = result(3);
		await vi.advanceTimersByTimeAsync(1000);
		hitRequests[1].resolve(secondPoll);
		await vi.advanceTimersByTimeAsync(0);
		expect(wrapper.emitted('update')).toEqual([[firstPoll], [secondPoll]]);

		await vi.advanceTimersByTimeAsync(1000);
		hitRequests[2].reject(new ApiError('Failed', 'Could not count', 'Server error', 500));
		await vi.advanceTimersByTimeAsync(0);
		expect(wrapper.emitted('update')).toHaveLength(2);

		await wrapper.setProps({ initialResults: result(4) });
		await vi.advanceTimersByTimeAsync(1000);
		await wrapper.setProps({ initialResults: result(5) });
		expect(hitRequests[3].cancel).toHaveBeenCalledOnce();
		hitRequests[3].resolve(result(6));
		await vi.advanceTimersByTimeAsync(0);
		expect(wrapper.emitted('update')).toHaveLength(2);

		const replacementPoll = result(7, 'finished');
		await vi.advanceTimersByTimeAsync(1000);
		hitRequests[4].resolve(replacementPoll);
		await vi.advanceTimersByTimeAsync(0);
		expect(wrapper.emitted('update')).toEqual([[firstPoll], [secondPoll], [replacementPoll]]);
	});

	test('uses co-occurrence semantics and omits the token-space percentage for collocation requests', () => {
		const summary = result(23, 'finished').summary;
		const initialResults: BLHitGroupResults = {
			hitGroups: [],
			summary: {
				...summary,
				results: {
					...summary.results,
					stats: { ...summary.results.stats, counted: { ...summary.results.stats.counted, documents: 47 }, numberOfGroups: 7, largestGroupSize: 10 },
				},
			},
		};
		const wrapper = shallowMount(ResultTotals, {
			global: { plugins: [api] },
			props: {
				annotatedFieldId: 'contents',
				executedRequest: {
					operation: 'collocations',
					params: { number: 20, patt: '[]', colltype: 'proximity', context: 5, annotation: 'word', sensitive: false, scorertype: 'coll-dice' },
				},
				indexId: 'first',
				initialResults,
			},
		});
		expect(wrapper.text()).toContain('collocations.results.cooccurrences');
		expect(wrapper.text()).toContain('collocations.results.totalCollocates');
		expect(wrapper.get('.totals-text').attributes('title')).toBeUndefined();
		expect(wrapper.find('.totals-percentage').exists()).toBe(false);
		expect(wrapper.text()).toContain('23');
		expect(wrapper.text()).not.toContain('47');
	});

	test('retries failed counts and resumes paused counts through the buttons', async () => {
		const wrapper = shallowMount(ResultTotals, {
			global: { plugins: [api] },
			props: {
				annotatedFieldId: 'contents',
				executedRequest: { operation: 'hits', params: { number: 20, patt: '[]' } },
				indexId: 'first',
				initialResults: result(),
			},
		});
		await vi.advanceTimersByTimeAsync(1000);
		hitRequests[0].reject(new ApiError('Failed', 'Could not count', 'Server error', 500));
		await vi.advanceTimersByTimeAsync(0);
		const retryButton = wrapper.get('button.totals-message.totals-button');
		expect(retryButton.attributes('type')).toBe('button');
		expect(retryButton.text()).toContain('results.resultsTotals.networkError');
		expect(retryButton.text()).toContain('results.resultsTotals.retry');
		await retryButton.trigger('click');
		await vi.advanceTimersByTimeAsync(1000);
		expect(hitRequests).toHaveLength(2);

		await vi.advanceTimersByTimeAsync(14000);
		expect(hitRequests[1].cancel).toHaveBeenCalledOnce();
		const continueButton = wrapper.get('.totals-button');
		expect(continueButton.attributes('type')).toBe('button');
		expect(continueButton.text()).toContain('results.resultsTotals.continue');
		await continueButton.trigger('click');
		await vi.advanceTimersByTimeAsync(1000);
		expect(hitRequests).toHaveLength(3);
	});
});
