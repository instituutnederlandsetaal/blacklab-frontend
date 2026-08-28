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
	IterativeResultCountLoader: class {
		private current = ref<TotalsOutput>();
		private failed = ref(false);
		continueCounting = vi.fn();
		dispose = vi.fn();
		isError = () => this.failed.value;
		isLoaded = () => this.current.value != null && !this.failed.value;

		get value() {
			return this.current.value;
		}
		get error() {
			return this.failed.value ? { message: 'error' } : undefined;
		}

		constructor(
			public input: unknown,
			public api: unknown,
		) {
			this.current.value = totalsOutput((input as { results: BLSearchResult }).results);
			mock.loaders.push(this);
		}

		publish(value: TotalsOutput) {
			this.failed.value = false;
			this.current.value = value;
		}
		fail() {
			this.current.value = undefined;
			this.failed.value = true;
		}
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
});
