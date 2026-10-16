// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import type { DisplaySettingsForRendering, HitRowData } from '@/pages/search/results/table/table-layout';
import type { Corpus } from '@/types/apptypes';
import type { BLHitResults } from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import GroupRowDetails from '@/pages/search/results/table/GroupRowDetails.vue';

let api: ReturnType<typeof createMockApi>;
let corpusContext: ReturnType<typeof createMockCorpusContext>;

let requests: Array<ReturnType<typeof deferredRequest>>;

function renderingInfo(): DisplaySettingsForRendering {
	return {
		corpus: { id: 'test', mainAnnotatedField: 'contents' },
		mainAnnotation: { id: 'word' } as DisplaySettingsForRendering['mainAnnotation'],
		otherAnnotations: [],
		detailedAnnotations: [],
		dependencyAnnotations: [],
		dependencyRelationClass: null,
		sortableAnnotations: [],
		annotationGroups: [],
		metadata: [],
		sourceField: { id: 'contents' } as DisplaySettingsForRendering['sourceField'],
		targetFields: [],
		specialFields: {},
		getSummary: () => 'Document',
		dir: 'ltr',
		html: false,
		i18n: createMockTranslate(),
		groupDisplayMode: 'table',
		hasCustomHitInfoColumn: () => false,
		getCustomHitInfo: () => null,
		getMatchInfoHighlightStyle: () => null,
		selectedRange: { first: 40, number: 10 },
	};
}

function deferredRequest() {
	let resolve!: (value: BLHitResults) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<BLHitResults>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { request: new CancelableRequest(promise, vi.fn()), resolve, reject };
}

function hitResults(first = 0, number = 20): BLHitResults {
	return {
		hits: Array.from({ length: number }, (_, index) => ({
			docPid: 'doc',
			start: first + index,
			end: first + index + 1,
			before: { punct: [], word: [] },
			match: { punct: ['', ''], word: [`hit-${first + index}`] },
			after: { punct: [], word: [] },
		})),
		docInfos: { doc: { metadata: {}, tokenCounts: [], mayView: true } },
		summary: {
			params: { patt: '[]', first, number },
			results: {
				window: { firstResult: first, requestedSize: number, actualSize: number, hasPrevious: first > 0, hasNext: first + number < 50 },
				stats: {
					processed: { status: 'finished', hits: 50, documents: 1, timeMs: 0, stoppedBecauseTooMany: false },
					counted: { status: 'finished', hits: 50, documents: 1, timeMs: 0, stoppedBecauseTooMany: false },
					numberOfGroups: undefined,
					largestGroupSize: undefined,
				},
				sample: { percentage: undefined, seed: undefined, sample: undefined },
			},
		},
	};
}

async function flush() {
	await flushPromises();
	await nextTick();
}

beforeEach(() => {
	vi.stubGlobal('CONTEXT_URL', '');
	api = createMockApi();
	corpusContext = createMockCorpusContext({ corpus: { id: 'test', isParallelCorpus: false } as Corpus });
	requests = [];
	api.blacklabApi.getHits.mockImplementation(() => {
		const request = deferredRequest();
		requests.push(request);
		return request.request;
	});
});

afterEach(() => vi.unstubAllGlobals());

describe('GroupRowDetails', () => {
	test('preserves sampling while overriding the detail range, group, and sort', async () => {
		const wrapper = shallowMount(GroupRowDetails, {
			global: { plugins: [api, corpusContext] },
			props: {
				row: { id: 'group-id', size: 50 } as never,
				info: renderingInfo(),
				cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] },
				type: 'hits',
				open: false,
				query: { patt: '[]', first: 99, number: 99, viewgroup: 'old', sort: 'old', sample: 10, sampleseed: 3 },
			},
		});

		await wrapper.setProps({ open: true });
		expect(api.blacklabApi.getHits).toHaveBeenCalledWith('test', {
			patt: '[]',
			first: 0,
			number: 20,
			viewgroup: 'group-id',
			sort: undefined,
			sample: 10,
			sampleseed: 3,
		});

		requests[0].resolve(hitResults());
		await flush();
		const previewRows = wrapper.findComponent({ name: 'GenericTable' }).props('rows').rows as HitRowData[];
		expect(previewRows).toHaveLength(20);
		expect(previewRows.every(row => row.type === 'hit' && !row.muted)).toBe(true);
		expect(previewRows[0].context.match[0].annotations.word).toBe('hit-0');
		await wrapper.find('button.btn-default').trigger('click');

		expect(api.blacklabApi.getHits.mock.calls[1][1]).toMatchObject({ first: 20, number: 20, viewgroup: 'group-id', sample: 10, sampleseed: 3 });
		expect(wrapper.text()).toContain('results.table.loading');
	});

	test('converts a collocation group to a hits request for inline context previews', async () => {
		const wrapper = shallowMount(GroupRowDetails, {
			global: { plugins: [api, corpusContext] },
			props: {
				row: { id: 'lemma:ship', size: 12 } as never,
				info: renderingInfo(),
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
		expect(api.blacklabApi.getHits).toHaveBeenCalledWith('test', {
			patt: 'meet([pos="N.*"], [word="water"],-3,4)',
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'lemma:ship',
			context: 5,
			filter: 'author:Austen',
			number: 12,
			first: 0,
		});
		expect(api.blacklabApi.getCollocations).not.toHaveBeenCalled();

		requests[0].resolve(hitResults(0, 12));
		await flush();
		expect(wrapper.text()).toContain('collocations.results.openAllContexts');
		expect(wrapper.get('button.close-concordances').attributes()).toMatchObject({
			'aria-label': 'results.table.close',
			title: 'results.table.close',
		});
		expect(wrapper.get('button.close-concordances span').attributes('aria-hidden')).toBe('true');
	});

	test('retries a failed preview page without skipping contexts or losing the loaded page', async () => {
		const wrapper = shallowMount(GroupRowDetails, {
			global: { plugins: [api, corpusContext] },
			props: {
				row: { id: 'group-id', size: 50 } as never,
				info: renderingInfo(),
				cols: { hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] },
				type: 'hits',
				open: false,
				query: { patt: '[]', filter: 'author:Austen' },
			},
		});
		await wrapper.setProps({ open: true });
		requests[0].reject(new Error('Temporary failure'));
		await flush();
		await wrapper.get('.retry-concordances').trigger('click');
		expect(api.blacklabApi.getHits.mock.calls[1][1]).toMatchObject({ first: 0, filter: 'author:Austen', viewgroup: 'group-id' });
		requests[1].resolve(hitResults());
		await flush();
		const loadedRows = wrapper
			.findComponent({ name: 'GenericTable' })
			.props('rows')
			.rows.map((row: object) => ({ ...row }));
		await wrapper.get('.concordance-controls .btn-default').trigger('click');
		requests[2].reject(new Error('Temporary failure'));
		await flush();
		await wrapper.get('.retry-concordances').trigger('click');
		expect(api.blacklabApi.getHits.mock.calls[3][1]).toMatchObject({ first: 20, filter: 'author:Austen', viewgroup: 'group-id' });
		expect(wrapper.findComponent({ name: 'GenericTable' }).props('rows').rows).toEqual(loadedRows);
		requests[3].resolve(hitResults(20));
		await flush();
		const rows = wrapper.findComponent({ name: 'GenericTable' }).props('rows').rows as HitRowData[];
		expect(rows).toHaveLength(40);
		expect(rows.map(row => row.hit.start)).toEqual(Array.from({ length: 40 }, (_, index) => index));
		expect(wrapper.find('.retry-concordances').exists()).toBe(false);
	});
});
