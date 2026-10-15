// @vitest-environment jsdom

import { provideMockActiveSearchParameters } from '@test/mocks/active-search-parameters';
import { createMockApi } from '@test/mocks/api';
import { createMockCorpusContext } from '@test/mocks/corpus';
import { createMockCustomizations } from '@test/mocks/customizations';
import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { computed, nextTick, reactive, ref, shallowRef, type App } from 'vue';

import { provideActiveSearch } from '@/features/search/model/active-search';
import { createActiveSearch } from '@/features/search/model/active-search';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as GlobalStore from '@/features/search/model/results/global-results-state';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import * as ResultsStore from '@/features/search/model/results/view-state';
import type { ViewModule } from '@/features/search/model/results/view-state';
import type { Corpus } from '@/types/apptypes';
import type { BLHitGroupResults, BLHitResults, BLSearchResult } from '@/types/blacklabtypes';
import { readSearchQuery } from '@/url/search-query';

import { CancelableRequest } from '@/shared/api/lib/api-types';

import Results from '@/pages/search/results/Results.vue';
import ResultsView from '@/pages/search/results/ResultsView.vue';

let api: ReturnType<typeof createMockApi>;
let corpusContext: ReturnType<typeof createMockCorpusContext>;
let corpus: Corpus;
let customizations: ReturnType<typeof createMockCustomizations>;

const resultComponents = {
	HitsResult: { template: '<div class="hits-result" />' },
	DocsResult: { template: '<div class="docs-result" />' },
	ResultsView,
};

let params: Record<string, unknown>;
let requests: Array<ReturnType<typeof deferredRequest>>;
let store: ViewModule;

function searchParametersPlugin() {
	return provideMockActiveSearchParameters(
		computed(() => {
			const view = store?.getState();
			const effective: Record<string, unknown> = {
				...params,
				group: view?.groupBy.length ? view.groupBy.join(',') : undefined,
				first: view?.first,
				number: view?.number,
				sort: view?.sort ?? (params as { sort?: string }).sort,
				...(view?.viewGroup ? { viewgroup: view.viewGroup } : {}),
			};
			if (effective.colltype) {
				delete effective.group;
				effective.scorertype = view?.collocationScorer ?? effective.scorertype;
			}
			return effective as EffectiveSearchParameters;
		}),
	);
}

function deferredRequest<T extends BLSearchResult = BLSearchResult>() {
	let resolve!: (value: BLSearchResult) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = value => resolvePromise(value as T);
		reject = rejectPromise;
	});
	return { request: new CancelableRequest(promise, vi.fn()), reject, resolve };
}

function result(patt: string, total = 105, hitCount = 1, first = 0, number = 20): BLHitResults {
	const stats = { status: 'finished' as const, hits: total, documents: 1, timeMs: 1, stoppedBecauseTooMany: false };
	return {
		hits: Array.from({ length: hitCount }, (_, index) => ({
			docPid: 'doc',
			start: first + index,
			end: first + index + 1,
			before: { punct: [], word: [], lemma: [] },
			match: { punct: [''], word: [`token-${first + index}`], lemma: [`lemma-${first + index}`] },
			after: { punct: [], word: [], lemma: [] },
		})),
		docInfos: { doc: { metadata: { title: ['Document title'] }, tokenCounts: [], mayView: true } },
		summary: {
			params: { patt, first, number },
			pattern: { bcql: patt, fieldName: 'contents', otherFields: ['parallel'] },
			results: {
				window: { firstResult: first, requestedSize: number, actualSize: hitCount, hasPrevious: first > 0, hasNext: first + hitCount < total },
				stats: { processed: stats, counted: stats, numberOfGroups: undefined, largestGroupSize: undefined },
				sample: { percentage: undefined, seed: undefined, sample: undefined },
			},
		},
	};
}

function groupedResult(patt: string, total = 105): BLHitGroupResults {
	const stats = { status: 'finished' as const, hits: total, documents: 1, timeMs: 1, stoppedBecauseTooMany: false };
	return {
		hitGroups: [{ identity: 'ship', identityDisplay: 'ship', properties: [{ name: 'hit:lemma', value: 'ship' }], size: 12, numberOfDocs: 1, score: 0.7 }],
		summary: {
			params: { patt, first: 0, number: 20 },
			pattern: { bcql: patt, fieldName: 'contents' },
			results: {
				window: { firstResult: 0, requestedSize: 20, actualSize: 1, hasPrevious: false, hasNext: false },
				stats: { processed: stats, counted: stats, numberOfGroups: 1, largestGroupSize: 12 },
				sample: { percentage: undefined, seed: undefined, sample: undefined },
			},
		},
	};
}

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
	await nextTick();
}

function searchStatePlugin(query: Record<string, unknown> = { patt: 'first' }, view = 'hits', getView = () => store) {
	InterfaceStore.actions.viewedResults(view);
	const submitted = shallowRef(readSearchQuery(query).submitted);
	const search = createActiveSearch(InterfaceStore.get.viewedResults, {
		corpus,
		submitted,
		global: GlobalStore.getState,
		viewState: () => getView()?.getState(),
		expandedRequestRange: () => getView()?.get.expandedRequestRange(),
		withSpans: () => false,
		debug: false,
	});
	return { submitted, parameters: search.parameters, plugin: (app: App) => provideActiveSearch(app, search) };
}

function mountView(active = true) {
	return shallowMount(ResultsView, { global: { plugins: [api, corpusContext, customizations, searchParametersPlugin()] }, props: { id: 'hits', active, store } });
}

beforeEach(({ onTestFinished }) => {
	vi.useFakeTimers();
	vi.stubGlobal('CONTEXT_URL', '');
	const previousGlobalState = { ...GlobalStore.getState() };
	const previousInterfaceState = { ...InterfaceStore.getState() };
	const previousViews = Object.fromEntries(Object.entries(ResultsStore.getState()).map(([id, view]) => [id, { ...view, groupBy: [...view.groupBy] }]));
	onTestFinished(async () => {
		Object.assign(GlobalStore.getState(), previousGlobalState);
		InterfaceStore.actions.replace(previousInterfaceState);
		ResultsStore.setPageSizePreference(() => GlobalStore.getState().pageSize);
		ResultsStore.actions.resetAllViews({ resetGroupBy: true });
		for (const [view, data] of Object.entries(previousViews)) ResultsStore.actions.replaceView({ view, data });
		await nextTick();
	});
	Object.assign(GlobalStore.getState(), { pageSize: 20, sampleMode: 'percentage', sampleSize: null, sampleSeed: null, context: null });
	ResultsStore.setPageSizePreference(() => GlobalStore.getState().pageSize);
	ResultsStore.actions.resetAllViews({ resetGroupBy: true });
	store = ResultsStore.createViewModule(() => GlobalStore.getState().pageSize);
	params = reactive({ patt: 'first' });
	const annotation = { id: 'word', isInternal: false, hasForwardIndex: true };
	const dependencyAnnotation = { id: 'lemma', isInternal: false, hasForwardIndex: true };
	const sourceField = { id: 'contents' };
	const targetField = { id: 'parallel', isParallel: true };
	const metadata = { id: 'title' };
	corpus = {
		mainAnnotatedField: 'contents',
		firstMainAnnotation: annotation,
		id: 'test',
		textDirection: 'ltr',
		isParallelCorpus: false,
		allAnnotations: [annotation, dependencyAnnotation],
		allAnnotationsMap: { word: annotation, lemma: dependencyAnnotation },
		allAnnotatedFieldsMap: { contents: sourceField },
		parallelAnnotatedFieldsMap: { parallel: targetField },
		allMetadataFieldsMap: { title: metadata },
		annotationGroups: [{ id: 'main', entries: ['word', 'lemma'] }],
		fieldInfo: { pidField: 'pid' },
	} as unknown as Corpus;
	api = createMockApi();
	corpusContext = createMockCorpusContext({ corpus: () => corpus });
	customizations = createMockCustomizations(() => corpus);
	customizations.formatError.mockReturnValue('formatted error');
	customizations.hitInfoColumnContent.mockReturnValue('custom');
	customizations.hitInfoColumnVisible.mockReturnValue(true);
	customizations.resultConcordanceAnnotationIdOptions.mockReturnValue(['word']);
	customizations.resultConcordanceAnnotationId.mockReturnValue('word');
	customizations.resultConcordanceAsHtml.mockReturnValue(true);
	customizations.resultDependencies.mockReturnValue({ lemma: 'lemma', upos: null, xpos: null, feats: [], relationClass: 'dep' });
	customizations.resultDetailedAnnotationIds.mockReturnValue(['word']);
	customizations.resultDetailedMetadataIds.mockReturnValue(['title']);
	customizations.resultDocumentSummary.mockReturnValue('summary');
	customizations.resultExportEnabled.mockReturnValue(true);
	customizations.resultViews.mockReturnValue([
		{ id: 'hits', title: 'Hits', component: 'HitsResult' },
		{ id: 'docs', title: 'Documents', component: 'DocsResult' },
	]);
	customizations.resultShownAnnotationIds.mockReturnValue(['lemma']);
	customizations.resultShownMetadataIds.mockReturnValue(['title']);
	customizations.resultSortAnnotationIds.mockReturnValue(['word']);
	customizations.resultSortAnnotationLabelsVisible.mockReturnValue(true);
	customizations.resultSortMetadataIds.mockReturnValue(['title']);
	customizations.resultSortMetadataLabelsVisible.mockReturnValue(true);
	requests = [];
	const enqueueRequest = <T extends BLSearchResult>() => {
		const request = deferredRequest<T>();
		requests.push(request);
		return request.request;
	};
	api.blacklabApi.getHits.mockImplementation(enqueueRequest);
	api.blacklabApi.getDocs.mockImplementation(enqueueRequest);
	api.blacklabApi.getCollocations.mockImplementation(enqueueRequest);
	vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(320);
	vi.spyOn(window, 'scroll').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('Results tabs', () => {
	test('switches result tabs through the stores and retains each view selection', async () => {
		customizations.resultViews.mockReturnValue([
			{ id: 'hits', title: 'Hits', component: 'ResultsView' },
			{ id: 'docs', title: 'Documents', component: 'ResultsView' },
		]);
		ResultsStore.getOrCreateModule('hits').actions.range({ first: 40, number: 20 });
		ResultsStore.getOrCreateModule('docs').actions.range({ first: 45, number: 30 });
		const { plugin } = searchStatePlugin({ patt: 'first' }, 'hits', () => ResultsStore.getOrCreateModule(InterfaceStore.get.viewedResults()!));
		const wrapper = shallowMount(Results, { global: { plugins: [api, corpusContext, customizations, plugin], components: resultComponents, stubs: { ResultsView: false } } });

		expect(api.blacklabApi.getHits).toHaveBeenCalledOnce();
		expect(api.blacklabApi.getHits.mock.calls[0][1]).toMatchObject({ first: 40, number: 20 });
		expect(api.blacklabApi.getDocs).not.toHaveBeenCalled();

		await wrapper.findAll('#resultTabs a')[1].trigger('click');
		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(wrapper.find('#resultTabs li.active').text()).toBe('Documents');
		expect(api.blacklabApi.getDocs).toHaveBeenCalledOnce();
		expect(api.blacklabApi.getDocs.mock.calls[0][1]).toMatchObject({ first: 40, number: 40 });

		await wrapper.findAll('#resultTabs a')[0].trigger('click');
		expect(wrapper.find('#resultTabs li.active').text()).toBe('Hits');
		expect(ResultsStore.getOrCreateModule('hits').get.selectedRange()).toEqual({ first: 40, number: 20 });
		expect(ResultsStore.getOrCreateModule('docs').get.selectedRange()).toEqual({ first: 45, number: 30 });
	});

	test('shows the inactive docs view for a collocation URL targeting docs', async () => {
		customizations.resultViews.mockReturnValue([
			{ id: 'hits', title: 'Hits', component: 'ResultsView' },
			{ id: 'docs', title: 'Documents', component: 'ResultsView' },
		]);
		const { plugin } = searchStatePlugin({ patt: 'first', colltype: 'proximity', context: '3' }, 'docs');
		const wrapper = shallowMount(Results, { global: { plugins: [api, corpusContext, customizations, plugin], components: resultComponents, stubs: { ResultsView: false } } });

		await flush();
		expect(wrapper.find('#resultTabs li.active').text()).toBe('Documents');
		expect(wrapper.findAll('#resultTabs li')[0].text()).toBe('queryForm.collocations');
		const docs = wrapper.findAllComponents(ResultsView).find(view => view.props('id') === 'docs')!;
		expect(docs.props('active')).toBe(true);
		expect(docs.text()).toContain('results.resultsView.inactiveView');
		expect(api.blacklabApi.getHits).not.toHaveBeenCalled();
		expect(api.blacklabApi.getDocs).not.toHaveBeenCalled();
		expect(api.blacklabApi.getCollocations).not.toHaveBeenCalled();
	});
});

describe('ResultsView', () => {
	test('passes the selected range to the table while pagination follows the live page-size preference', async () => {
		const global = GlobalStore.getState();
		store.actions.range({ first: 45, number: 30 });
		const { plugin } = searchStatePlugin();
		const wrapper = shallowMount(ResultsView, { global: { plugins: [api, corpusContext, customizations, plugin] }, props: { id: 'hits', active: true, store } });

		requests[0].resolve(result('first', 105, 40, 40, 40));
		await flush();
		const pagination = wrapper.findComponent({ name: 'Pagination' });
		const table = wrapper.findComponent({ name: 'GenericTable' });
		expect(pagination.props()).toMatchObject({ page: 2, page2: 3, maxPage: 5 });
		expect(table.props('info').selectedRange).toEqual({ first: 45, number: 30 });
		global.pageSize = 50;
		await flush();
		expect(pagination.props()).toMatchObject({ page: 0, page2: 1, maxPage: 2 });
		expect(table.props('info').selectedRange).toEqual({ first: 45, number: 30 });
		expect(api.blacklabApi.getHits.mock.calls.at(-1)?.[1]).toMatchObject({ first: 0, number: 100 });

		requests.at(-1)!.resolve(result('first', 205, 100, 0, 100));
		await flush();
		pagination.vm.$emit('change', 3);
		await nextTick();
		expect(store.get.selectedRange()).toEqual({ first: 150, number: 50 });
		expect(api.blacklabApi.getHits.mock.calls.at(-1)?.[1]).toMatchObject({ first: 150, number: 50 });
	});

	test('changes display mode without refetching and requests a newly submitted query', async () => {
		const { submitted, plugin } = searchStatePlugin();
		shallowMount(ResultsView, { global: { plugins: [api, corpusContext, customizations, plugin] }, props: { id: 'hits', active: true, store } });

		store.actions.groupDisplayMode('hits');
		await nextTick();
		expect(api.blacklabApi.getHits).toHaveBeenCalledOnce();
		expect(requests[0].request.cancel).not.toHaveBeenCalled();

		submitted.value = readSearchQuery({ patt: 'second' }).submitted;
		await nextTick();
		expect(api.blacklabApi.getHits).toHaveBeenCalledTimes(2);
		expect(api.blacklabApi.getHits.mock.calls[1][1]).toMatchObject({ patt: 'second' });
	});

	test('refreshes equivalent parameters when the corpus changes', async () => {
		corpus = reactive(corpus);
		mountView();
		corpus.id = 'other';
		await nextTick();
		expect(api.blacklabApi.getHits).toHaveBeenCalledTimes(2);
		expect(api.blacklabApi.getHits.mock.calls[1][0]).toBe('other');
	});

	test('defers dirty inactive views and refreshes when activated', async () => {
		const wrapper = mountView(false);
		expect(api.blacklabApi.getHits).not.toHaveBeenCalled();

		(params as { patt: string }).patt = 'changed';
		await nextTick();
		expect(api.blacklabApi.getHits).not.toHaveBeenCalled();

		await wrapper.setProps({ active: true });
		expect(api.blacklabApi.getHits).toHaveBeenCalledOnce();
	});

	test.each(['success', 'cancellation'])('ignores a stale %s after the user returns to an earlier query', async outcome => {
		const wrapper = mountView();
		const stale = requests[0];
		(params as { patt: string }).patt = 'second';
		await nextTick();
		(params as { patt: string }).patt = 'first';
		await nextTick();

		if (outcome === 'cancellation') stale.reject({ title: 'cancelled', isCancelledRequest: true });
		else stale.resolve(result('stale'));
		await flush();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(true);
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);
		expect(customizations.formatError).not.toHaveBeenCalled();
		expect(wrapper.text()).not.toContain('formatted error');

		requests[2].resolve(result('first'));
		await flush();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ query: expect.objectContaining({ patt: 'first' }), disabled: false });
	});

	test('corrects invalid capture grouping in the store before retrying', async () => {
		store.actions.groupBy(['capture:word:i:capture']);
		const { plugin } = searchStatePlugin();
		shallowMount(ResultsView, {
			global: { plugins: [api, corpusContext, customizations, plugin] },
			props: { id: 'hits', active: true, store },
		});

		requests[0].reject({ title: 'UNKNOWN_MATCH_INFO', isCancelledRequest: false });
		await flush();

		expect(store.getState().groupBy).toEqual([]);
		expect(customizations.formatError).toHaveBeenCalledWith(expect.anything(), 'groups');
		expect(api.blacklabApi.getHits).toHaveBeenCalledTimes(2);
	});

	test('cancels on unmount and ignores noncooperative late settlement', async () => {
		const wrapper = mountView();
		const pending = requests[0];
		wrapper.unmount();
		expect(pending.request.cancel).toHaveBeenCalledOnce();

		pending.resolve(result('first'));
		await flush();
		expect(customizations.resultDocumentSummary).not.toHaveBeenCalled();
		expect(customizations.hitInfoColumnContent).not.toHaveBeenCalled();
		expect(window.scroll).not.toHaveBeenCalled();
	});

	test('updated totals extend pagination and page clicks request the selected page', async () => {
		const wrapper = mountView();
		const currentResult = result('first');
		requests[0].resolve(currentResult);
		await flush();
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(true);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props('rows').rows).toMatchObject([
			{ type: 'doc', summary: 'summary', doc: { docPid: 'doc' } },
			{ type: 'hit', customHitInfo: 'custom', context: { match: [{ annotations: { word: 'token-0', lemma: 'lemma-0' } }] } },
		]);
		expect(wrapper.findComponent({ name: 'Export' }).props()).toMatchObject({ results: currentResult, type: 'hits', disabled: false });
		const pagination = wrapper.findComponent({ name: 'Pagination' });
		expect(pagination.props('maxPage')).toBe(5);
		wrapper.findComponent({ name: 'Totals' }).vm.$emit('update', result('counted', 205));
		await nextTick();
		expect(pagination.props('maxPage')).toBe(10);
		pagination.vm.$emit('change', 2);
		await nextTick();
		expect(store.get.selectedRange()).toEqual({ first: 40, number: 20 });
		expect(api.blacklabApi.getHits.mock.calls.at(-1)?.[1]).toMatchObject({ first: 40, number: 20 });
	});

	test('applies table sort and view-group events, gates them while loading, and restores the previous range and sort', async () => {
		store.actions.range({ first: 20, number: 20 });
		const wrapper = mountView();
		requests[0].resolve(result('first'));
		await flush();

		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('changeSort', 'hit:word:i');
		expect(store.getState().sort).toBe('hit:word:i');
		await nextTick();
		expect(requests).toHaveLength(2);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props('disabled')).toBe(true);
		expect(wrapper.findComponent({ name: 'Export' }).props('disabled')).toBe(true);

		const loadingTable = wrapper.findComponent({ name: 'GenericTable' });
		loadingTable.vm.$emit('changeSort', 'other');
		loadingTable.vm.$emit('viewgroup', 'blocked', 'Blocked');
		expect(store.getState()).toMatchObject({ sort: 'hit:word:i', viewGroup: null, first: 20, number: 20 });

		requests[1].resolve(result('sorted'));
		await flush();
		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('viewgroup', 'group-id', 'Group');
		expect(store.getState()).toMatchObject({ sort: null, viewGroup: 'group-id', first: 0 });
		await nextTick();
		requests[2].resolve(result('group'));
		await flush();

		const back = wrapper.findAll('button').find(button => button.text().includes('backToGroupedResults'))!;
		await back.trigger('click');
		expect(store.getState()).toMatchObject({ sort: 'hit:word:i', viewGroup: null, first: 20, number: 20 });
	});

	test('uses effective default sorting without modifying the selected sort', async () => {
		store = ResultsStore.getOrCreateModule('hits');
		corpus.isParallelCorpus = true;
		(params as { sort?: string }).sort = 'alignments';
		mountView();
		expect(store.getState().sort).toBeNull();
		expect(api.blacklabApi.getHits.mock.calls[0][1]).toMatchObject({ sort: 'alignments' });

		await nextTick();
		expect(requests[0].request.cancel).not.toHaveBeenCalled();
		expect(requests).toHaveLength(1);
	});

	test('dispatches a collocation list with the exact executed request and expandable rows', async () => {
		store = ResultsStore.getOrCreateModule('hits');
		corpus.isParallelCorpus = true;
		(params as { sort?: string }).sort = 'alignments';
		Object.assign(params as object, {
			patt: '[word="water"]',
			collpatt: '[lemma="ship"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});

		const wrapper = mountView();
		expect(api.blacklabApi.getCollocations).toHaveBeenCalledOnce();
		expect(api.blacklabApi.getHits).not.toHaveBeenCalled();
		expect(store.getState().sort).toBeNull();
		const [indexId, executedParams, config] = api.blacklabApi.getCollocations.mock.calls[0];
		expect(indexId).toBe('test');
		expect(executedParams).toMatchObject({
			patt: '[word="water"]',
			collpatt: '[lemma="ship"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		expect(executedParams).not.toHaveProperty('group');
		expect(executedParams).not.toHaveProperty('viewgroup');
		expect(config).toEqual({ headers: { 'Cache-Control': 'no-cache' } });

		requests[0].resolve(groupedResult('[word="water"]'));
		await flush();

		expect(wrapper.findAllComponents({ name: 'GroupBy' })).toHaveLength(0);
		expect(wrapper.findComponent({ name: 'BreadCrumbs' }).exists()).toBe(false);
		expect(wrapper.findAll('button').some(button => button.text().includes('backToGroupedResults'))).toBe(false);
		expect(wrapper.findComponent({ name: 'Export' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ operation: 'collocations', type: 'hits' });
		expect(wrapper.findComponent({ name: 'GenericTable' }).props('rows').rows).toMatchObject([{ type: 'group', id: 'ship', displayname: 'ship', size: 12, score: 0.7 }]);
		expect(
			wrapper
				.findComponent({ name: 'GenericTable' })
				.props('header')
				.map((column: { key: string }) => column.key),
		).toEqual(['collocate', 'association', 'cooccurrences', 'documents']);
		expect(wrapper.findComponent({ name: 'Sort' }).props()).toMatchObject({ hits: false, docs: false, groups: true });
		expect(wrapper.findAll('.btn-group button').map(button => button.text())).not.toEqual(expect.arrayContaining(['table', 'hits']));
		const totalsRequest = wrapper.findComponent({ name: 'Totals' }).props('executedRequest') as { operation: string; params: object };
		expect(totalsRequest.operation).toBe('collocations');
		expect(totalsRequest.params).toEqual(executedParams);

		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('changeSort', 'size');
		expect(store.getState().sort).toBe('size');
		await nextTick();
		expect(api.blacklabApi.getCollocations).toHaveBeenCalledTimes(2);
	});

	test('clears and scrolls results when the submitted collocation window changes', async () => {
		Object.assign(params as object, { colltype: 'proximity', context: 5, annotation: 'word', sensitive: false });
		const wrapper = mountView();
		requests[0].resolve(groupedResult('first'));
		await flush();
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(true);

		(params as { context: number }).context = 10;
		await nextTick();
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);
		requests[1].resolve(groupedResult('first'));
		await flush();
		expect(window.scroll).toHaveBeenCalledTimes(2);
	});

	test('opens collocation hits with viewgroup and restores list position and association sort', async () => {
		Object.assign(params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		store.actions.range({ first: 20, number: 20 });
		store.actions.sort('score');

		const wrapper = mountView();
		requests[0].resolve(groupedResult('[word="water"]'));
		await flush();

		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('viewgroup', 'ship', 'ship');
		expect(store.getState()).toMatchObject({ first: 0, viewGroup: 'ship', sort: null });
		await nextTick();
		expect(api.blacklabApi.getCollocations).toHaveBeenCalledOnce();
		expect(api.blacklabApi.getHits).toHaveBeenCalledOnce();
		const [indexId, allContextsParameters, config] = api.blacklabApi.getHits.mock.calls[0];
		expect(indexId).toBe('test');
		expect(allContextsParameters).toEqual({
			context: 5,
			first: 0,
			hitfiltercrit: 'hit:lemma:i',
			hitfilterval: 'ship',
			number: 20,
			patt: 'meet([], [word="water"],-5,5)',
		});
		expect(config).toEqual({ headers: { 'Cache-Control': 'no-cache' } });

		const allContextsResult = result(allContextsParameters.patt!);
		Object.assign(allContextsResult.summary.params, allContextsParameters);
		requests[1].resolve(allContextsResult);
		await flush();
		expect(wrapper.findComponent({ name: 'BreadCrumbs' }).props('crumbs')[0].label).toBe('queryForm.collocations');
		expect(wrapper.findComponent({ name: 'Export' }).props()).toMatchObject({ results: allContextsResult, type: 'hits' });
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ operation: 'hits', query: allContextsResult.summary.params });
		expect(wrapper.findComponent({ name: 'Totals' }).props('executedRequest')).toEqual({ operation: 'hits', params: allContextsParameters });

		await wrapper
			.findAll('button')
			.find(button => button.text().includes('backToCollocations'))!
			.trigger('click');
		expect(store.getState()).toMatchObject({ first: 20, number: 20, viewGroup: null, sort: 'score' });
		await nextTick();
		expect(api.blacklabApi.getCollocations).toHaveBeenCalledTimes(2);
		expect(api.blacklabApi.getCollocations.mock.calls[1][1]).toMatchObject({ first: 20, number: 20, patt: '[word="water"]', sort: 'score' });
		expect(api.blacklabApi.getCollocations.mock.calls[1][1]).not.toHaveProperty('viewgroup');
	});

	test.each(['empty', 'error'])('can return from %s collocation contexts to the previous list page', async outcome => {
		Object.assign(params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		store.actions.range({ first: 40, number: 20 });
		store.actions.sort('size');

		const wrapper = mountView();
		requests[0].resolve(groupedResult('[word="water"]'));
		await flush();
		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('viewgroup', 'ship', 'ship');
		await nextTick();
		if (outcome === 'error') requests[1].reject({ title: 'failure', isCancelledRequest: false });
		else {
			requests[1].resolve(result('empty', 0, 0));
		}
		await flush();
		await wrapper
			.findAll('button')
			.find(button => button.text().includes('backToCollocations'))!
			.trigger('click');
		expect(store.getState()).toMatchObject({ first: 40, number: 20, viewGroup: null, sort: 'size' });
		expect(api.blacklabApi.getCollocations.mock.calls.at(-1)?.[1]).toMatchObject({ first: 40, sort: 'size' });
	});

	test('changes the collocation scorer from the results controls and reruns from the first page', async () => {
		Object.assign(params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		store.actions.range({ first: 40, number: 20 });

		const wrapper = mountView();
		requests[0].resolve(groupedResult('[word="water"]'));
		await flush();

		const scorerToggle = wrapper.findComponent({ name: 'CollocationScorerToggle' });
		expect(scorerToggle.props()).toMatchObject({ disabled: false, modelValue: 'coll-dice' });

		scorerToggle.vm.$emit('update:modelValue', 'coll-salience');
		await nextTick();
		expect(store.getState()).toMatchObject({ collocationScorer: 'coll-salience', first: 0 });
		expect(api.blacklabApi.getCollocations).toHaveBeenCalledTimes(2);
		expect(api.blacklabApi.getCollocations.mock.calls[1][1]).toMatchObject({ first: 0, scorertype: 'coll-salience' });
	});

	test('formats collocation failures as grouped and keeps incompatible controls hidden after clearing the result', async () => {
		Object.assign(params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		store.actions.groupBy(['stale']);
		store.actions.collocationScorer('coll-salience');
		const wrapper = mountView();
		requests[0].reject({ title: 'failure', isCancelledRequest: false });
		await flush();

		expect(customizations.formatError).toHaveBeenCalledWith(expect.anything(), 'groups');
		expect(wrapper.findAllComponents({ name: 'GroupBy' })).toHaveLength(0);
		expect(wrapper.findComponent({ name: 'Export' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'Totals' }).exists()).toBe(false);
		const scorerToggle = wrapper.findComponent({ name: 'CollocationScorerToggle' });
		expect(scorerToggle.props('modelValue')).toBe('coll-salience');
		scorerToggle.vm.$emit('update:modelValue', 'coll-dice');
		await nextTick();
		expect(api.blacklabApi.getCollocations.mock.calls.at(-1)?.[1]).toMatchObject({ scorertype: 'coll-dice' });
	});

	test('renders invalid, loading, cancelled, error, retry, and empty states', async () => {
		(params as { patt?: string }).patt = undefined;
		let wrapper = mountView();
		expect(api.blacklabApi.getHits).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('results.resultsView.inactiveView');
		wrapper.unmount();

		store = ResultsStore.createViewModule(() => GlobalStore.getState().pageSize);
		(params as { patt?: string }).patt = 'first';
		wrapper = mountView();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(true);
		requests[0].reject({ title: 'cancelled', isCancelledRequest: true });
		await flush();
		expect(customizations.formatError).not.toHaveBeenCalled();
		expect(wrapper.find('.no-results-found').exists()).toBe(false);
		wrapper.unmount();

		store = ResultsStore.createViewModule(() => GlobalStore.getState().pageSize);
		wrapper = mountView();
		requests[1].reject({ title: 'failure', isCancelledRequest: false });
		await flush();
		expect(wrapper.text()).toContain('formatted error');
		await wrapper.find('.no-results-found button').trigger('click');
		expect(requests).toHaveLength(3);

		requests[2].resolve(result('empty', 0, 0));
		await flush();
		expect(wrapper.text()).toContain('results.resultsView.noResultsFound');
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);
	});

	test('builds sortable breadcrumbs and deactivates grouping, sampling, and sorting from the root crumb', async () => {
		store.actions.groupBy(['hit:word:i']);
		store.actions.sort('size');
		GlobalStore.actions.sampleSeed(3);
		GlobalStore.actions.sampleSize(25);
		const wrapper = mountView();
		const grouped = groupedResult('first');
		Object.assign(grouped.summary.params, { group: 'hit:word:i', sample: 25, sampleseed: 3, sort: 'size' });
		requests[0].resolve(grouped);
		await flush();

		const crumbs = wrapper.findComponent({ name: 'BreadCrumbs' }).props('crumbs') as Array<{ label: string; onClick?: () => void }>;
		expect(crumbs.map(crumb => crumb.label)).toEqual([
			'results.resultsView.navigation.hits',
			'results.resultsView.navigation.groupedBy',
			'results.resultsView.navigation.randomSample',
			'results.resultsView.navigation.sortedBy',
		]);
		crumbs.at(-1)!.onClick!();
		expect(store.getState().sort).toBe('-size');
		crumbs[0].onClick!();
		expect(store.getState()).toMatchObject({ groupBy: [], sort: null });
		expect(GlobalStore.getState().sampleSize).toBeNull();
	});
});

test('does not request documents before active search parameters are available', async () => {
	shallowMount(ResultsView, {
		global: { plugins: [api, corpusContext, customizations, provideMockActiveSearchParameters(ref(undefined))] },
		props: { id: 'docs', active: true, store },
	});

	await flush();
	expect(api.blacklabApi.getDocs).not.toHaveBeenCalled();
});
