// @vitest-environment jsdom

import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';

import * as ResultsStore from '@/features/search/model/results/view-state';

import GroupBy from '@/pages/search/results/groupby/GroupBy.vue';

enableAutoUnmount(afterEach);

const mock = vi.hoisted(() => ({
	api: { getHits: vi.fn() },
	corpus: undefined as unknown,
	customizations: undefined as unknown,
	params: undefined as unknown,
}));

vi.mock('@/app/state/root-store', () => ({ get: { blacklabParameters: () => ({ ...(mock.params as object) }) } }));
vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ref(mock.corpus) }));
vi.mock('@/customization-api/internal/internal-api', () => ({ useCustomizations: () => mock.customizations }));
vi.mock('@/features/search/model/form/filter-state', () => ({ getState: () => ({ filters: {} }) }));
vi.mock('@/features/search/model/query-state', () => ({ get: { sourceField: () => 'contents' } }));
vi.mock('@/features/search/model/results/global-results-state', () => ({ getState: () => ({ context: 5 }) }));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => mock.api }));

function mountGroupBy() {
	return shallowMount(GroupBy, { props: { type: 'hits' } });
}

beforeEach(() => {
	vi.clearAllMocks();
	ResultsStore.getOrCreateModule('hits').actions.reset({ resetGroupBy: true });
	mock.params = reactive({ patt: '[]', first: 37, number: 50, group: 'field:title', subcorpussize: true, listvalues: 'all', sort: 'hit:word,numhits,-hit:lemma,-numhits' });
	mock.corpus = {
		id: 'test',
		isParallelCorpus: false,
		allAnnotationsMap: { word: { id: 'word', defaultDisplayName: 'Word' } },
		annotationGroups: [{ id: 'main', annotatedFieldId: 'contents', entries: ['word'], isRemainderGroup: false }],
		allMetadataFieldsMap: { title: { id: 'title', defaultDisplayName: 'Title' } },
		metadataGroups: [{ id: 'metadata', entries: ['title'] }],
		parallelAnnotatedFieldsMap: {},
		relations: { spans: {} },
	};
	mock.customizations = {
		groupOptionGroup: vi.fn(group => group),
		groupingSpanAttribute: vi.fn(() => null),
		legacyShouldIncludeWithinAttribute: vi.fn(() => false),
		legacyShouldIncludeWithinSpan: vi.fn(() => false),
		matchInfoHighlightStyle: vi.fn(),
		resultConcordanceAnnotationId: vi.fn(() => 'word'),
		resultConcordanceAsHtml: vi.fn(() => false),
		resultGroupAnnotationIds: vi.fn(() => ['word']),
		resultGroupAnnotationLabelsVisible: vi.fn(() => true),
		resultGroupMetadataIds: vi.fn(() => ['title']),
		resultGroupMetadataLabelsVisible: vi.fn(() => true),
		resultMetadataField: vi.fn(() => true),
	};
	mock.api.getHits.mockReturnValue({ request: new Promise(() => undefined) });
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

	test('requests a stable preview only when the effective query changes', async () => {
		const wrapper = mountGroupBy();
		await wrapper.find('.groupselect').trigger('click');
		await nextTick();

		expect(mock.api.getHits).toHaveBeenCalledWith('test', {
			patt: '[]',
			sort: 'hit:word,-hit:lemma',
			listmetadatavalues: '__nothing__',
			first: 0,
			number: 1,
			waitfortotal: false,
		});

		(mock.params as { first: number }).first = 99;
		await nextTick();
		expect(mock.api.getHits).toHaveBeenCalledOnce();

		(mock.params as { sort: string }).sort = 'numhits';
		await nextTick();
		expect(mock.api.getHits).toHaveBeenLastCalledWith('test', {
			patt: '[]',
			listmetadatavalues: '__nothing__',
			first: 0,
			number: 1,
			waitfortotal: false,
		});

		(mock.params as { patt: string }).patt = '[word="test"]';
		await nextTick();
		expect(mock.api.getHits).toHaveBeenCalledTimes(3);
	});

	test('requests the hit with the most alignments for a parallel preview', async () => {
		(mock.corpus as { isParallelCorpus: boolean }).isParallelCorpus = true;
		const wrapper = mountGroupBy();
		await wrapper.find('.groupselect').trigger('click');
		await nextTick();

		expect(mock.api.getHits).toHaveBeenCalledWith('test', {
			patt: '[]',
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

		const calls = (mock.customizations as { groupOptionGroup: ReturnType<typeof vi.fn> }).groupOptionGroup.mock.calls;
		expect(calls.length).toBeGreaterThan(0);
		expect(calls[0][1]).toMatchObject({ $t: expect.any(Function), $tMetaDisplayName: expect.any(Function) });
	});
});
