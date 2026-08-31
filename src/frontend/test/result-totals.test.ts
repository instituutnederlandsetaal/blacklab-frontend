// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import type { TotalsOutput } from '@/api/async/logic/result-count/result-count-helpers';
import type { BLSearchResult } from '@/types/blacklabtypes';

import ResultTotals from '@/pages/search/results/ResultTotals.vue';

const mock = vi.hoisted(() => ({
	api: {},
	loaders: [] as Array<{
		api: unknown;
		continueCounting: ReturnType<typeof vi.fn>;
		dispose: ReturnType<typeof vi.fn>;
		input: unknown;
		fail: () => void;
		publish: (value: TotalsOutput) => void;
	}>,
}));

vi.mock('@/shared/api', () => ({
	useBlackLabApi: () => mock.api,
}));

vi.mock('@/api/async/logic/result-count/result-count-from-query', () => ({
	createIterativeResultCountLoader: (input: unknown, api: unknown) => {
		const current = ref<TotalsOutput | undefined>(totalsOutput((input as { results: BLSearchResult }).results));
		const failed = ref(false);
		const loader = {
			input,
			api,
			continueCounting: vi.fn(),
			dispose: vi.fn(),
			isError: () => failed.value,
			isLoaded: () => current.value != null && !failed.value,
			get value() {
				return current.value;
			},
			get error() {
				return failed.value ? { message: 'error' } : undefined;
			},
			publish(value: TotalsOutput) {
				failed.value = false;
				current.value = value;
			},
			fail() {
				current.value = undefined;
				failed.value = true;
			},
		};
		mock.loaders.push(loader);
		return loader;
	},
}));

function totalsOutput(results: BLSearchResult): TotalsOutput {
	return {
		results,
		docsRetrieved: 1,
		docsCounted: 1,
		hitsRetrieved: 1,
		hitsCounted: 1,
		searchTime: 1,
		tokensInMatchingDocuments: 1,
		numberOfMatchingDocuments: 1,
		state: 'counting',
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mock.loaders.length = 0;
});

describe('ResultTotals', () => {
	test('disposes replaced and unmounted result loaders', async () => {
		const initialResults = {} as BLSearchResult;
		const wrapper = shallowMount(ResultTotals, {
			props: { annotatedFieldId: 'contents', indexId: 'first', initialResults, type: 'hits' },
		});
		let current = mock.loaders[0];
		let expectedLoaderCount = 1;

		expect(current.input).toEqual({ annotatedFieldId: 'contents', indexId: 'first', operation: 'hits', results: initialResults });
		expect(current.api).toBe(mock.api);
		expect(current.dispose).not.toHaveBeenCalled();

		async function replaceLoader(props: Parameters<typeof wrapper.setProps>[0]) {
			const outgoing = current;
			await wrapper.setProps(props);
			current = mock.loaders.at(-1)!;

			expect(mock.loaders).toHaveLength(++expectedLoaderCount);
			expect(outgoing.dispose).toHaveBeenCalledOnce();
			expect(current.dispose).not.toHaveBeenCalled();
		}

		await replaceLoader({ annotatedFieldId: 'parallel' });
		expect(current.input).toEqual({ annotatedFieldId: 'parallel', indexId: 'first', operation: 'hits', results: initialResults });

		await replaceLoader({ indexId: 'second' });
		expect(current.input).toEqual({ annotatedFieldId: 'parallel', indexId: 'second', operation: 'hits', results: initialResults });

		const nextResults = {} as BLSearchResult;
		await replaceLoader({ initialResults: nextResults });
		expect(current.input).toEqual({ annotatedFieldId: 'parallel', indexId: 'second', operation: 'hits', results: nextResults });

		await replaceLoader({ type: 'docs' });
		expect(current.input).toEqual({ annotatedFieldId: 'parallel', indexId: 'second', operation: 'docs', results: nextResults });

		wrapper.unmount();
		expect(current.dispose).toHaveBeenCalledOnce();
		for (const replaced of mock.loaders.slice(0, -1)) expect(replaced.dispose).toHaveBeenCalledOnce();
	});

	test('emits later loaded results but not initial, errored, or stale loader values', async () => {
		const initialResults = {} as BLSearchResult;
		const wrapper = shallowMount(ResultTotals, {
			props: { annotatedFieldId: 'contents', indexId: 'first', initialResults, type: 'hits' },
		});
		const initialLoader = mock.loaders[0];
		expect(wrapper.emitted('update')).toBeUndefined();

		const firstPoll = {} as BLSearchResult;
		initialLoader.publish(totalsOutput(firstPoll));
		await nextTick();
		const secondPoll = {} as BLSearchResult;
		initialLoader.publish(totalsOutput(secondPoll));
		await nextTick();
		expect(wrapper.emitted('update')).toEqual([[firstPoll], [secondPoll]]);

		initialLoader.fail();
		await nextTick();
		expect(wrapper.emitted('update')).toHaveLength(2);

		const replacementResults = {} as BLSearchResult;
		await wrapper.setProps({ initialResults: replacementResults });
		expect(wrapper.emitted('update')).toHaveLength(2);
		initialLoader.publish(totalsOutput({} as BLSearchResult));
		await nextTick();
		expect(wrapper.emitted('update')).toHaveLength(2);

		const replacementPoll = {} as BLSearchResult;
		mock.loaders.at(-1)!.publish(totalsOutput(replacementPoll));
		await nextTick();
		expect(wrapper.emitted('update')).toEqual([[firstPoll], [secondPoll], [replacementPoll]]);
	});

	test('activates the retry and paused continue buttons once each', async () => {
		const wrapper = shallowMount(ResultTotals, {
			props: { annotatedFieldId: 'contents', indexId: 'first', initialResults: {} as BLSearchResult, type: 'hits' },
		});
		const loader = mock.loaders[0];

		loader.fail();
		await nextTick();
		const retryButton = wrapper.get<HTMLButtonElement>('button.totals-message.totals-button');
		expect(retryButton.element).toBeInstanceOf(HTMLButtonElement);
		expect(retryButton.attributes('type')).toBe('button');
		expect(retryButton.find('.fa-exclamation-triangle').exists()).toBe(true);
		expect(retryButton.find('.fa-rotate-right').exists()).toBe(true);
		expect(retryButton.text()).toContain('results.resultsTotals.networkError');
		expect(retryButton.text()).toContain('results.resultsTotals.retry');
		await retryButton.trigger('click');
		expect(loader.continueCounting).toHaveBeenCalledOnce();

		loader.publish({ ...totalsOutput({} as BLSearchResult), state: 'paused' });
		await nextTick();
		loader.continueCounting.mockClear();
		await wrapper.get('.totals-button').trigger('click');
		expect(loader.continueCounting).toHaveBeenCalledOnce();
	});
});
