// @vitest-environment jsdom

import { enableAutoUnmount, flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import GroupRowDetails from '@/pages/search/results/table/GroupRowDetails.vue';

enableAutoUnmount(afterEach);

const mock = vi.hoisted(() => ({
	api: { getHits: vi.fn(), getDocs: vi.fn(), getCollocations: vi.fn() },
	corpus: { id: 'test', isParallelCorpus: false },
	makeRows: vi.fn(),
	requests: [] as Array<ReturnType<typeof deferredRequest>>,
}));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ref(mock.corpus) }));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => mock.api }));
vi.mock('@/pages/search/results/table/table-layout', () => ({ definitions: [], makeRows: (...args: unknown[]) => mock.makeRows(...args) }));

function deferredRequest() {
	let resolve!: (value: unknown) => void;
	const promise = new Promise(resolvePromise => (resolve = resolvePromise));
	return { promise, resolve };
}

async function flush() {
	await flushPromises();
	await nextTick();
}

beforeEach(() => {
	vi.clearAllMocks();
	mock.requests = [];
	mock.api.getHits.mockImplementation(() => {
		const request = deferredRequest();
		mock.requests.push(request);
		return request.promise;
	});
	mock.api.getCollocations.mockImplementation(() => {
		const request = deferredRequest();
		mock.requests.push(request);
		return request.promise;
	});
	mock.makeRows.mockImplementation(() => ({ rows: Array.from({ length: 11 }, () => ({ type: 'hit' })) }));
});

describe('GroupRowDetails', () => {
	test('preserves sampling while overriding the detail range, group, and sort without rendering debug text', async () => {
		const wrapper = shallowMount(GroupRowDetails, {
			props: {
				row: { id: 'group-id', size: 50 } as never,
				info: {} as never,
				cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] },
				type: 'hits',
				open: false,
				query: { patt: '[]', first: 99, number: 99, viewgroup: 'old', sort: 'old', sample: 10, sampleseed: 3 },
			},
		});

		await wrapper.setProps({ open: true });
		expect(mock.api.getHits).toHaveBeenCalledWith('test', {
			patt: '[]',
			first: 0,
			number: 20,
			viewgroup: 'group-id',
			sort: undefined,
			sample: 10,
			sampleseed: 3,
		});

		mock.requests[0].resolve({});
		await flush();
		await wrapper.find('button.btn-default').trigger('click');

		expect(mock.api.getHits.mock.calls[1][1]).toMatchObject({ first: 20, number: 20, viewgroup: 'group-id', sample: 10, sampleseed: 3 });
		expect(wrapper.text()).toContain('results.table.loading');
		expect(wrapper.text()).not.toContain('HOI');
	});

	test('converts a collocation group to a hits request for inline context previews', async () => {
		const wrapper = shallowMount(GroupRowDetails, {
			props: {
				row: { id: 'lemma:ship', size: 12 } as never,
				info: {} as never,
				cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] },
				type: 'hits',
				operation: 'collocations',
				open: false,
				query: {
					patt: '[word="water"]',
					collpatt: '[pos="N.*"]',
					colltype: 'proximity',
					context: '3:4',
					annotation: 'lemma',
					scorertype: 'coll-dice',
					filter: 'author:Austen',
					number: 99,
					first: 99,
					sort: 'score',
				},
			},
		});

		await wrapper.setProps({ open: true });
		expect(mock.api.getHits).toHaveBeenCalledWith('test', {
			patt: 'meet([pos="N.*"], [word="water"],-3,4)',
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'lemma:ship',
			context: '3:4',
			filter: 'author:Austen',
			number: 12,
			first: 0,
		});
		expect(mock.api.getCollocations).not.toHaveBeenCalled();

		mock.requests[0].resolve({});
		await flush();
		expect(wrapper.text()).toContain('collocations.results.openAllContexts');
		expect(wrapper.get('button.close-concordances').attributes()).toMatchObject({
			'aria-label': 'results.table.close',
			title: 'results.table.close',
		});
		expect(wrapper.get('button.close-concordances span').attributes('aria-hidden')).toBe('true');
	});
});
