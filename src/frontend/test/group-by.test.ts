// @vitest-environment jsdom

import { provideMockActiveSearchParameters } from '@test/mocks/active-search-parameters';
import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockCustomizations } from '@test/mocks/customizations';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { computed, nextTick, reactive } from 'vue';

import * as GlobalStore from '@/features/search/model/results/global-results-state';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import * as ResultsStore from '@/features/search/model/results/view-state';
import type { Corpus } from '@/types/apptypes';
import type { BLHitGroupResults, BLHitResults } from '@/types/blacklabtypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import GroupBy from '@/pages/search/results/groupby/GroupBy.vue';

let api: ReturnType<typeof createMockApi>;
let corpusContext: ReturnType<typeof createMockCorpusContext>;
let corpus: Corpus;
let customizations: ReturnType<typeof createMockCustomizations>;

let params: EffectiveSearchParameters;

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	const request = new CancelableRequest(new Promise<T>(resolvePromise => (resolve = resolvePromise)), vi.fn());
	return { request, resolve };
}

function hitResults(word: string): BLHitResults {
	return {
		hits: [{ docPid: 'doc', start: 0, end: 1, before: { punct: [], word: [] }, match: { punct: [''], word: [word] }, after: { punct: [], word: [] } }],
		docInfos: {},
		summary: {
			params: { patt: '[]', first: 0, number: 1 },
			pattern: { bcql: '[]', fieldName: 'contents' },
			results: {
				window: { firstResult: 0, requestedSize: 1, actualSize: 1, hasPrevious: false, hasNext: false },
				stats: {
					processed: { status: 'finished', hits: 1, documents: 1, timeMs: 0, stoppedBecauseTooMany: false },
					counted: { status: 'finished', hits: 1, documents: 1, timeMs: 0, stoppedBecauseTooMany: false },
					numberOfGroups: undefined,
					largestGroupSize: undefined,
				},
				sample: { percentage: undefined, seed: undefined, sample: undefined },
			},
		},
	};
}

function mountGroupBy() {
	return shallowMount(GroupBy, {
		global: {
			plugins: [api, corpusContext, customizations, provideMockActiveSearchParameters(computed(() => ({ ...params })))],
		},
		props: { type: 'hits' },
	});
}

beforeEach(({ onTestFinished }) => {
	vi.clearAllMocks();
	ResultsStore.setPageSizePreference(() => GlobalStore.getState().pageSize);
	const hits = ResultsStore.getOrCreateModule('hits');
	const previousHits = { ...hits.getState(), groupBy: [...hits.getState().groupBy] };
	onTestFinished(() => hits.actions.replace(previousHits));
	hits.actions.reset({ resetGroupBy: true });
	params = reactive({
		patt: '[]',
		context: 5,
		first: 37,
		number: 50,
		group: 'field:title',
		subcorpussize: true,
		listvalues: 'all',
		sort: 'hit:word,numhits,-alignments,-hit:lemma,-numhits,alignments',
	});
	corpus = {
		mainAnnotatedField: 'contents',
		id: 'test',
		isParallelCorpus: false,
		allAnnotationsMap: { word: { id: 'word', defaultDisplayName: 'Word' } },
		annotationGroups: [{ id: 'main', annotatedFieldId: 'contents', entries: ['word'], isRemainderGroup: false }],
		allMetadataFieldsMap: { title: { id: 'title', defaultDisplayName: 'Title' } },
		metadataGroups: [{ id: 'metadata', entries: ['title'] }],
		parallelAnnotatedFieldsMap: {},
		relations: { spans: {} },
	} as unknown as Corpus;
	api = createMockApi();
	corpusContext = createMockCorpusContext({ corpus: () => corpus });
	customizations = createMockCustomizations(() => corpus);
	customizations.resultConcordanceAnnotationId.mockReturnValue('word');
	customizations.resultGroupAnnotationIds.mockReturnValue(['word']);
	customizations.resultGroupAnnotationLabelsVisible.mockReturnValue(true);
	customizations.resultGroupMetadataIds.mockReturnValue(['title']);
	customizations.resultGroupMetadataLabelsVisible.mockReturnValue(true);
	customizations.resultMetadataField.mockReturnValue(true);
	api.blacklabApi.getHits.mockImplementation(() => deferredRequest<BLHitResults | BLHitGroupResults>().request);
});

describe('GroupBy', () => {
	test('tracks external grouping state and clears it without reopening the editor', async () => {
		const store = ResultsStore.getOrCreateModule('hits');
		store.actions.groupBy(['field:title']);
		const wrapper = mountGroupBy();
		expect(wrapper.find('.panel').exists()).toBe(true);

		await wrapper.find('.panel-footer.text-right button').trigger('click');
		await nextTick();
		expect(store.getState().groupBy).toEqual([]);
		expect(wrapper.find('.groupselect').exists()).toBe(true);
	});

	test('strips reserved count and alignment sorts from a nonparallel preview', async () => {
		const wrapper = mountGroupBy();
		await wrapper.find('.groupselect').trigger('click');
		await nextTick();

		expect(api.blacklabApi.getHits).toHaveBeenCalledWith('test', {
			patt: '[]',
			context: 5,
			sort: 'hit:word,-hit:lemma',
			listmetadatavalues: '__nothing__',
			first: 0,
			number: 1,
			waitfortotal: false,
		});

		params.first = 99;
		await nextTick();
		expect(api.blacklabApi.getHits).toHaveBeenCalledOnce();

		params.sort = 'numhits';
		await nextTick();
		expect(api.blacklabApi.getHits).toHaveBeenLastCalledWith('test', {
			patt: '[]',
			context: 5,
			listmetadatavalues: '__nothing__',
			first: 0,
			number: 1,
			waitfortotal: false,
		});

		params.patt = '[word="test"]';
		await nextTick();
		expect(api.blacklabApi.getHits).toHaveBeenCalledTimes(3);
	});

	test('requests the hit with the most alignments for a parallel preview', async () => {
		corpus.isParallelCorpus = true;
		const wrapper = mountGroupBy();
		await wrapper.find('.groupselect').trigger('click');
		await nextTick();

		expect(api.blacklabApi.getHits).toHaveBeenCalledWith('test', {
			patt: '[]',
			context: 5,
			sort: 'alignments,hit:word,-hit:lemma',
			listmetadatavalues: '__nothing__',
			first: 0,
			number: 1,
			waitfortotal: false,
		});
	});

	test('passes the translation facade to grouping customizations', async () => {
		const wrapper = mountGroupBy();
		await wrapper.find('.groupselect').trigger('click');
		const addMetadata = wrapper.findAll('.panel-heading button').find(button => button.text().includes('results.groupBy.metadata'));
		expect(addMetadata).toBeDefined();
		await addMetadata!.trigger('click');

		const calls = customizations.groupOptionGroup.mock.calls;
		expect(calls.length).toBeGreaterThan(0);
		expect(calls[0][1]).toMatchObject({ $t: expect.any(Function), $tMetaDisplayName: expect.any(Function) });
	});

	test('owns stale, grouped, hit-only, and unmounted previews', async () => {
		const stale = deferredRequest<BLHitResults | BLHitGroupResults>();
		const grouped = deferredRequest<BLHitResults | BLHitGroupResults>();
		const current = deferredRequest<BLHitResults | BLHitGroupResults>();
		const unmounted = deferredRequest<BLHitResults | BLHitGroupResults>();
		api.blacklabApi.getHits.mockReturnValueOnce(stale.request).mockReturnValueOnce(grouped.request).mockReturnValueOnce(current.request).mockReturnValueOnce(unmounted.request);
		const wrapper = mountGroupBy();
		await wrapper.find('.groupselect').trigger('click');
		await wrapper
			.findAll('.panel-heading button')
			.find(button => button.text().includes('results.groupBy.annotation'))!
			.trigger('click');

		params.patt = '[word="grouped"]';
		await nextTick();
		expect(stale.request.cancel).toHaveBeenCalledOnce();
		stale.resolve(hitResults('stale'));
		await flushPromises();
		expect(wrapper.find('.hit-preview .word').exists()).toBe(false);

		grouped.resolve({ hitGroups: [], summary: hitResults('grouped').summary });
		await flushPromises();
		expect(wrapper.find('.hit-preview .word').exists()).toBe(false);

		params.patt = '[word="current"]';
		await nextTick();
		const currentResult = hitResults('current');
		current.resolve(currentResult);
		await flushPromises();
		expect(wrapper.findAll('.hit-preview .word .main').map(word => word.text())).toEqual(['current']);

		params.patt = '[word="unmounted"]';
		await nextTick();
		wrapper.unmount();
		expect(unmounted.request.cancel).toHaveBeenCalledOnce();
	});
});
