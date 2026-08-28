// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { BLSearchResult } from '@/types/blacklabtypes';

import ResultTotals from '@/pages/search/results/ResultTotals.vue';

const mock = vi.hoisted(() => ({
	api: {},
	loaders: [] as Array<{
		api: unknown;
		continueCounting: ReturnType<typeof vi.fn>;
		dispose: ReturnType<typeof vi.fn>;
		input: unknown;
	}>,
}));

vi.mock('@/shared/api', () => ({
	useBlackLabApi: () => mock.api,
}));

vi.mock('@/api/async/logic/result-count/result-count-from-query', () => ({
	IterativeResultCountLoader: class {
		continueCounting = vi.fn();
		dispose = vi.fn();
		isError = () => false;
		isLoaded = () => false;

		constructor(
			public input: unknown,
			public api: unknown,
		) {
			mock.loaders.push(this);
		}
	},
}));

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
});
