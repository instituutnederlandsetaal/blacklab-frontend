// @vitest-environment jsdom

import { enableAutoUnmount, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { computed, nextTick, reactive, ref, shallowRef, type App } from 'vue';

import { provideActiveSearch } from '@/features/search/model/active-search';
import { createActiveSearch } from '@/features/search/model/active-search';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import * as ResultsStore from '@/features/search/model/results/view-state';
import type { ViewModule } from '@/features/search/model/results/view-state';
import type { Corpus } from '@/types/apptypes';
import type { BLSearchResult } from '@/types/blacklabtypes';
import { readSearchQuery } from '@/url/search-query';

import { provideMockActiveSearchParameters } from './mocks/active-search-parameters';

import Results from '@/pages/search/results/Results.vue';
import ResultsView from '@/pages/search/results/ResultsView.vue';

enableAutoUnmount(afterEach);

const mock = vi.hoisted(() => ({
	api: { getHits: vi.fn(), getDocs: vi.fn(), getCollocations: vi.fn() },
	corpus: undefined as unknown,
	customizations: undefined as unknown,
	globalState: undefined as unknown,
	params: undefined as unknown,
	requests: [] as Array<ReturnType<typeof deferredRequest>>,
	sampleSize: vi.fn(),
	store: undefined as ViewModule | undefined,
	makeColumns: vi.fn(),
	makeRows: vi.fn(),
}));

function searchParametersPlugin() {
	return provideMockActiveSearchParameters(
		computed(() => {
			const view = mock.store?.getState();
			const params: Record<string, unknown> = {
				...(mock.params as Record<string, unknown>),
				group: view?.groupBy.length ? view.groupBy.join(',') : undefined,
				first: view?.first,
				number: view?.number,
				sort: view?.sort ?? (mock.params as { sort?: string }).sort,
				...(view?.viewGroup ? { viewgroup: view.viewGroup } : {}),
			};
			if (params.colltype) {
				delete params.group;
				params.scorertype = view?.collocationScorer ?? params.scorertype;
			}
			return params as EffectiveSearchParameters;
		}),
	);
}
vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ref(mock.corpus) }));
vi.mock('@/customization-api/internal/internal-api', () => ({ useCustomizations: () => mock.customizations }));
vi.mock('@/features/search/model/results/global-results-state', () => ({
	getState: () => mock.globalState,
	actions: { sampleSize: mock.sampleSize },
}));
vi.mock('@/shared/api', () => ({ useBlackLabApi: () => mock.api }));
vi.mock('@/pages/search/results/table/table-layout', () => ({
	definitions: [],
	makeColumns: (...args: unknown[]) => mock.makeColumns(...args),
	makeRows: (...args: unknown[]) => mock.makeRows(...args),
}));
vi.mock('@/utils/grouping', () => ({
	humanizeGroupByOrSortBy: () => 'sort',
	humanizeSerializedGroupBy: (_translate: unknown, groups: string[]) => groups,
	parseGroupBy: () => [{ type: 'context', annotation: 'word', context: { type: 'label', label: 'capture' } }],
	parseSortBy: () => ({ type: 'custom', value: 'sort' }),
	serializeSortByOrGroupBy: () => [],
}));

function deferredRequest() {
	let resolve!: (value: BLSearchResult) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<BLSearchResult>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { request: Object.assign(promise, { cancel: vi.fn() }), reject, resolve };
}

function result(patt: string, total = 105, hitCount = 1): BLSearchResult {
	return {
		hits: Array.from({ length: hitCount }, (_, start) => ({ docPid: 'doc', start, end: start + 1, before: { punct: [] }, match: { punct: [] }, after: { punct: [] } })),
		docInfos: {},
		summary: {
			params: { patt, first: 0, number: 20 },
			pattern: { bcql: patt, fieldName: 'contents', otherFields: ['parallel'] },
			results: { stats: { processed: { hits: total, documents: 1 }, counted: { hits: total, documents: 1 } } },
		},
	} as unknown as BLSearchResult;
}

function collocationResult(patt: string, total = 105): BLSearchResult {
	return {
		hitGroups: [{ identity: 'ship', identityDisplay: 'ship', properties: [{ name: 'hit:lemma', value: 'ship' }], size: 12 }],
		summary: {
			params: { patt, first: 0, number: 20 },
			pattern: { bcql: patt, fieldName: 'contents' },
			results: {
				stats: { processed: { hits: total, documents: 1 }, counted: { hits: total, documents: 1 }, numberOfGroups: 1, largestGroupSize: 12 },
			},
		},
	} as unknown as BLSearchResult;
}

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
	await nextTick();
}

const cleanup: (() => void)[] = [];
function searchStatePlugin(query: Record<string, unknown> = { patt: 'first' }, view = 'hits', getView = () => mock.store) {
	InterfaceStore.actions.viewedResults(view);
	const submitted = shallowRef(readSearchQuery(query).submitted);
	const search = createActiveSearch(InterfaceStore.get.viewedResults, {
		corpus: mock.corpus as Corpus,
		submitted,
		global: () => mock.globalState as any,
		viewState: () => getView()?.getState(),
		expandedRequestRange: () => getView()?.get.expandedRequestRange(),
		withSpans: () => false,
		debug: false,
	});
	return { submitted, parameters: search.parameters, plugin: (app: App) => provideActiveSearch(app, search) };
}

function mountView(active = true) {
	return shallowMount(ResultsView, { global: { plugins: [searchParametersPlugin()] }, props: { id: 'hits', active, store: mock.store! } });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	mock.globalState = reactive({ pageSize: 20, sampleMode: 'percentage', sampleSize: null });
	ResultsStore.setPageSizePreference(() => (mock.globalState as { pageSize: number }).pageSize);
	ResultsStore.getOrCreateModule('hits').actions.reset({ resetGroupBy: true });
	mock.store = ResultsStore.createViewModule(() => (mock.globalState as { pageSize: number }).pageSize);
	mock.params = reactive({ patt: 'first' });
	mock.globalState = reactive({ pageSize: 20, sampleMode: 'percentage', sampleSize: null });
	const annotation = { id: 'word', isInternal: false, hasForwardIndex: true };
	const dependencyAnnotation = { id: 'lemma', isInternal: false, hasForwardIndex: true };
	const sourceField = { id: 'contents' };
	const targetField = { id: 'parallel', isParallel: true };
	const metadata = { id: 'title' };
	mock.corpus = {
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
		annotationGroups: [{ id: 'main', fields: [annotation, dependencyAnnotation] }],
		fieldInfo: { pidField: 'pid' },
	};
	mock.customizations = {
		formatError: vi.fn(() => 'formatted error'),
		hitInfoColumnContent: vi.fn(() => 'custom'),
		hitInfoColumnVisible: vi.fn(() => true),
		matchInfoHighlightStyle: vi.fn(),
		resultConcordanceAnnotationIdOptions: vi.fn(() => ['word']),
		resultConcordanceAnnotationId: vi.fn(() => 'word'),
		setResultConcordanceAnnotationId: vi.fn(),
		resultConcordanceAsHtml: vi.fn(() => true),
		resultDependencies: vi.fn(() => ({ lemma: 'lemma', upos: null, xpos: null, feats: [], relationClass: 'dep' })),
		resultDetailedAnnotationIds: vi.fn(() => ['word']),
		resultDetailedMetadataIds: vi.fn(() => ['title']),
		resultDocumentSummary: vi.fn(() => 'summary'),
		resultExportEnabled: vi.fn(() => true),
		resultViews: vi.fn(() => [
			{ id: 'hits', title: 'Hits', component: { template: '<div class="hits-result" />' } },
			{ id: 'docs', title: 'Documents', component: { template: '<div class="docs-result" />' } },
		]),
		resultShownAnnotationIds: vi.fn(() => ['lemma']),
		resultShownMetadataIds: vi.fn(() => ['title']),
		resultSortAnnotationIds: vi.fn(() => ['word']),
		resultSortAnnotationLabelsVisible: vi.fn(() => true),
		resultSortMetadataIds: vi.fn(() => ['title']),
		resultSortMetadataLabelsVisible: vi.fn(() => true),
	};
	mock.sampleSize.mockImplementation(value => ((mock.globalState as { sampleSize: number | null }).sampleSize = value));
	mock.requests = [];
	const enqueueRequest = () => {
		const request = deferredRequest();
		mock.requests.push(request);
		return request.request;
	};
	mock.api.getHits.mockImplementation(enqueueRequest);
	mock.api.getDocs.mockImplementation(enqueueRequest);
	mock.api.getCollocations.mockImplementation(enqueueRequest);
	mock.makeColumns.mockReturnValue({ hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] });
	mock.makeRows.mockReturnValue({ rows: [{ type: 'hit' }] });
	Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get: () => 320 });
	vi.spyOn(window, 'scroll').mockImplementation(() => {});
});

afterEach(() => {
	cleanup.splice(0).forEach(stop => stop());
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('Results tabs', () => {
	test('switches result tabs through the stores and retains each view selection', async () => {
		(mock.customizations as { resultViews: ReturnType<typeof vi.fn> }).resultViews.mockReturnValue([
			{ id: 'hits', title: 'Hits', component: ResultsView },
			{ id: 'docs', title: 'Documents', component: ResultsView },
		]);
		ResultsStore.getOrCreateModule('hits').actions.range({ first: 40, number: 20 });
		ResultsStore.getOrCreateModule('docs').actions.range({ first: 45, number: 30 });
		const { plugin } = searchStatePlugin({ patt: 'first' }, 'hits', () => ResultsStore.getOrCreateModule(InterfaceStore.get.viewedResults()!));
		const wrapper = shallowMount(Results, { global: { plugins: [plugin], stubs: { ResultsView: false } } });
		expect(mock.api.getHits).toHaveBeenCalledOnce();
		expect(mock.api.getHits.mock.calls[0][1]).toMatchObject({ first: 40, number: 20 });
		expect(mock.api.getDocs).not.toHaveBeenCalled();

		await wrapper.findAll('#resultTabs a')[1].trigger('click');
		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(wrapper.find('#resultTabs li.active').text()).toBe('Documents');
		expect(mock.api.getDocs).toHaveBeenCalledOnce();
		expect(mock.api.getDocs.mock.calls[0][1]).toMatchObject({ first: 40, number: 40 });

		await wrapper.findAll('#resultTabs a')[0].trigger('click');
		expect(wrapper.find('#resultTabs li.active').text()).toBe('Hits');
		expect(ResultsStore.getOrCreateModule('hits').get.selectedRange()).toEqual({ first: 40, number: 20 });
		expect(ResultsStore.getOrCreateModule('docs').get.selectedRange()).toEqual({ first: 45, number: 30 });
	});

	test('shows the inactive docs view for a collocation URL targeting docs', async () => {
		(mock.customizations as { resultViews: ReturnType<typeof vi.fn> }).resultViews.mockReturnValue([
			{ id: 'hits', title: 'Hits', component: ResultsView },
			{ id: 'docs', title: 'Documents', component: ResultsView },
		]);
		const { plugin } = searchStatePlugin({ patt: 'first', colltype: 'proximity', context: '3' }, 'docs');
		const wrapper = shallowMount(Results, { global: { plugins: [plugin], stubs: { ResultsView: false } } });
		await flush();
		expect(wrapper.find('#resultTabs li.active').text()).toBe('Documents');
		expect(wrapper.findAll('#resultTabs li')[0].text()).toBe('queryForm.collocations');
		const docs = wrapper.findAllComponents(ResultsView).find(view => view.props('id') === 'docs')!;
		expect(docs.props('active')).toBe(true);
		expect(docs.text()).toContain('results.resultsView.inactiveView');
		expect(mock.api.getHits).not.toHaveBeenCalled();
		expect(mock.api.getDocs).not.toHaveBeenCalled();
		expect(mock.api.getCollocations).not.toHaveBeenCalled();
	});
});

describe('ResultsView', () => {
	test('derives page labels and highlighting from its own custom range with a live preference', async () => {
		const global = mock.globalState as { pageSize: number };
		mock.store!.actions.range({ first: 45, number: 30 });
		const { plugin } = searchStatePlugin();
		const wrapper = shallowMount(ResultsView, { global: { plugins: [plugin] }, props: { id: 'hits', active: true, store: mock.store! } });
		mock.requests[0].resolve(result('first'));
		await flush();
		const pagination = wrapper.findComponent({ name: 'Pagination' });
		const table = wrapper.findComponent({ name: 'GenericTable' });
		expect(pagination.props()).toMatchObject({ page: 2, page2: 3, maxPage: 5 });
		expect(table.props('info').selectedRange).toEqual({ first: 45, number: 30 });
		global.pageSize = 50;
		await flush();
		expect(pagination.props()).toMatchObject({ page: 0, page2: 1, maxPage: 2 });
		expect(table.props('info').selectedRange).toEqual({ first: 45, number: 30 });
		expect(mock.api.getHits.mock.calls.at(-1)?.[1]).toMatchObject({ first: 0, number: 100 });
	});

	test('changes display mode without refetching and requests a newly submitted query', async () => {
		const { submitted, plugin } = searchStatePlugin();
		shallowMount(ResultsView, { global: { plugins: [plugin] }, props: { id: 'hits', active: true, store: mock.store! } });

		mock.store!.actions.groupDisplayMode('hits');
		await nextTick();
		expect(mock.api.getHits).toHaveBeenCalledOnce();
		expect(mock.requests[0].request.cancel).not.toHaveBeenCalled();

		submitted.value = readSearchQuery({ patt: 'second' }).submitted;
		await nextTick();
		expect(mock.api.getHits).toHaveBeenCalledTimes(2);
		expect(mock.api.getHits.mock.calls[1][1]).toMatchObject({ patt: 'second' });
	});

	test('refreshes equivalent parameters when the corpus changes', async () => {
		mock.corpus = reactive(mock.corpus as Corpus);
		mountView();
		(mock.corpus as Corpus).id = 'other';
		await nextTick();
		expect(mock.api.getHits).toHaveBeenCalledTimes(2);
		expect(mock.api.getHits.mock.calls[1][0]).toBe('other');
	});

	test('defers dirty inactive views and refreshes when activated', async () => {
		const wrapper = mountView(false);
		expect(mock.api.getHits).not.toHaveBeenCalled();

		(mock.params as { patt: string }).patt = 'changed';
		await nextTick();
		expect(mock.api.getHits).not.toHaveBeenCalled();

		await wrapper.setProps({ active: true });
		expect(mock.api.getHits).toHaveBeenCalledOnce();
	});

	test.each(['success', 'cancellation'])('ignores a stale %s after the user returns to an earlier query', async outcome => {
		const wrapper = mountView();
		const stale = mock.requests[0];
		(mock.params as { patt: string }).patt = 'second';
		await nextTick();
		(mock.params as { patt: string }).patt = 'first';
		await nextTick();

		if (outcome === 'cancellation') stale.reject({ title: 'cancelled', isCancelledRequest: true });
		else stale.resolve(result('stale'));
		await flush();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(true);
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);
		expect((mock.customizations as { formatError: ReturnType<typeof vi.fn> }).formatError).not.toHaveBeenCalled();
		expect(wrapper.text()).not.toContain('formatted error');

		mock.requests[2].resolve(result('first'));
		await flush();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ query: expect.objectContaining({ patt: 'first' }), disabled: false });
	});

	test('corrects invalid capture grouping in the store before retrying', async () => {
		mock.store!.actions.groupBy(['capture']);
		const { plugin } = searchStatePlugin();
		shallowMount(ResultsView, {
			global: { plugins: [plugin] },
			props: { id: 'hits', active: true, store: mock.store! },
		});
		mock.requests[0].reject({ title: 'UNKNOWN_MATCH_INFO', isCancelledRequest: false });
		await flush();

		expect(mock.store!.getState().groupBy).toEqual([]);
		expect((mock.customizations as { formatError: ReturnType<typeof vi.fn> }).formatError).toHaveBeenCalledWith(expect.anything(), 'groups');
		expect(mock.api.getHits).toHaveBeenCalledTimes(2);
	});

	test('cancels on unmount and ignores noncooperative late settlement', async () => {
		const wrapper = mountView();
		const pending = mock.requests[0];
		wrapper.unmount();
		expect(pending.request.cancel).toHaveBeenCalledOnce();

		pending.resolve(result('first'));
		await flush();
		expect(mock.makeRows).not.toHaveBeenCalled();
		expect(window.scroll).not.toHaveBeenCalled();
	});

	test('updated totals extend pagination and page clicks request the selected page', async () => {
		const wrapper = mountView();
		const currentResult = result('first');
		mock.requests[0].resolve(currentResult);
		await flush();
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(true);
		expect(wrapper.findComponent({ name: 'Export' }).props()).toMatchObject({ results: currentResult, type: 'hits', disabled: false });
		const pagination = wrapper.findComponent({ name: 'Pagination' });
		expect(pagination.props('maxPage')).toBe(5);
		wrapper.findComponent({ name: 'Totals' }).vm.$emit('update', result('counted', 205));
		await nextTick();
		expect(pagination.props('maxPage')).toBe(10);
		pagination.vm.$emit('change', 2);
		await nextTick();
		expect(mock.store!.get.selectedRange()).toEqual({ first: 40, number: 20 });
		expect(mock.api.getHits.mock.calls.at(-1)?.[1]).toMatchObject({ first: 40, number: 20 });
	});

	test('applies table sort and view-group events, gates them while loading, and restores the previous range and sort', async () => {
		mock.store!.actions.range({ first: 20, number: 20 });
		const wrapper = mountView();
		mock.requests[0].resolve(result('first'));
		await flush();

		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('changeSort', 'word');
		expect(mock.store!.getState().sort).toBe('word');
		await nextTick();
		expect(mock.requests).toHaveLength(2);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props('disabled')).toBe(true);
		expect(wrapper.findComponent({ name: 'Export' }).props('disabled')).toBe(true);

		const loadingTable = wrapper.findComponent({ name: 'GenericTable' });
		loadingTable.vm.$emit('changeSort', 'other');
		loadingTable.vm.$emit('viewgroup', 'blocked', 'Blocked');
		expect(mock.store!.getState()).toMatchObject({ sort: 'word', viewGroup: null, first: 20, number: 20 });

		mock.requests[1].resolve(result('sorted'));
		await flush();
		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('viewgroup', 'group-id', 'Group');
		expect(mock.store!.getState()).toMatchObject({ sort: null, viewGroup: 'group-id', first: 0 });
		await nextTick();
		mock.requests[2].resolve(result('group'));
		await flush();

		const back = wrapper.findAll('button').find(button => button.text().includes('backToGroupedResults'))!;
		await back.trigger('click');
		expect(mock.store!.getState()).toMatchObject({ sort: 'word', viewGroup: null, first: 20, number: 20 });
	});

	test('uses effective default sorting without modifying the selected sort', async () => {
		mock.store = ResultsStore.getOrCreateModule('hits');
		(mock.corpus as { isParallelCorpus: boolean }).isParallelCorpus = true;
		(mock.params as { sort?: string }).sort = 'alignments';
		mountView();
		expect(mock.store.getState().sort).toBeNull();
		expect(mock.api.getHits.mock.calls[0][1]).toMatchObject({ sort: 'alignments' });

		await nextTick();
		expect(mock.requests[0].request.cancel).not.toHaveBeenCalled();
		expect(mock.requests).toHaveLength(1);
	});

	test('dispatches a collocation list with the exact executed request and expandable rows', async () => {
		mock.store = ResultsStore.getOrCreateModule('hits');
		(mock.corpus as { isParallelCorpus: boolean }).isParallelCorpus = true;
		(mock.params as { sort?: string }).sort = 'alignments';
		Object.assign(mock.params as object, {
			patt: '[word="water"]',
			collpatt: '[lemma="ship"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		mock.makeColumns.mockReturnValue({ hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: ['table', 'hits'] });
		mock.makeRows.mockReturnValue({ rows: [{ type: 'group' }] });

		const wrapper = mountView();
		expect(mock.api.getCollocations).toHaveBeenCalledOnce();
		expect(mock.api.getHits).not.toHaveBeenCalled();
		expect(mock.store.getState().sort).toBeNull();
		const [indexId, executedParams, config] = mock.api.getCollocations.mock.calls[0];
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

		mock.requests[0].resolve(collocationResult('[word="water"]'));
		await flush();

		expect(wrapper.findAllComponents({ name: 'GroupBy' })).toHaveLength(0);
		expect(wrapper.findComponent({ name: 'BreadCrumbs' }).exists()).toBe(false);
		expect(wrapper.findAll('button').some(button => button.text().includes('backToGroupedResults'))).toBe(false);
		expect(wrapper.findComponent({ name: 'Export' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ operation: 'collocations', type: 'hits' });
		expect(wrapper.findComponent({ name: 'Sort' }).props()).toMatchObject({ hits: false, docs: false, groups: true });
		expect(wrapper.findAll('.btn-group button').map(button => button.text())).not.toEqual(expect.arrayContaining(['table', 'hits']));
		const totalsRequest = wrapper.findComponent({ name: 'Totals' }).props('executedRequest') as { operation: string; params: object };
		expect(totalsRequest.operation).toBe('collocations');
		expect(totalsRequest.params).toBe(executedParams);

		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('changeSort', 'size');
		expect(mock.store.getState().sort).toBe('size');
		await nextTick();
		expect(mock.api.getCollocations).toHaveBeenCalledTimes(2);
	});

	test('clears and scrolls results when the submitted collocation window changes', async () => {
		Object.assign(mock.params as object, { colltype: 'proximity', context: 5, annotation: 'word', sensitive: false });
		const wrapper = mountView();
		mock.requests[0].resolve(collocationResult('first'));
		await flush();
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(true);

		(mock.params as { context: number }).context = 10;
		await nextTick();
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);
		mock.requests[1].resolve(collocationResult('first'));
		await flush();
		expect(window.scroll).toHaveBeenCalledTimes(2);
	});

	test('opens collocation hits with viewgroup and restores list position and association sort', async () => {
		Object.assign(mock.params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		mock.store!.actions.range({ first: 20, number: 20 });
		mock.store!.actions.sort('score');
		mock.makeRows.mockReturnValue({ rows: [{ type: 'group' }] });
		const wrapper = mountView();
		mock.requests[0].resolve(collocationResult('[word="water"]'));
		await flush();

		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('viewgroup', 'ship', 'ship');
		expect(mock.store!.getState()).toMatchObject({ first: 0, viewGroup: 'ship', sort: null });
		await nextTick();
		expect(mock.api.getCollocations).toHaveBeenCalledOnce();
		expect(mock.api.getHits).toHaveBeenCalledOnce();
		const [indexId, allContextsParameters, config] = mock.api.getHits.mock.calls[0];
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

		mock.makeRows.mockReturnValue({ rows: [{ type: 'hit' }] });
		const allContextsResult = result(allContextsParameters.patt!);
		Object.assign(allContextsResult.summary.params, allContextsParameters);
		mock.requests[1].resolve(allContextsResult);
		await flush();
		expect(wrapper.findComponent({ name: 'BreadCrumbs' }).props('crumbs')[0].label).toBe('queryForm.collocations');
		expect(wrapper.findComponent({ name: 'Export' }).props()).toMatchObject({ results: allContextsResult, type: 'hits' });
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ operation: 'hits', query: allContextsResult.summary.params });
		expect(wrapper.findComponent({ name: 'Totals' }).props('executedRequest')).toEqual({ operation: 'hits', params: allContextsParameters });

		await wrapper
			.findAll('button')
			.find(button => button.text().includes('backToCollocations'))!
			.trigger('click');
		expect(mock.store!.getState()).toMatchObject({ first: 20, number: 20, viewGroup: null, sort: 'score' });
		await nextTick();
		expect(mock.api.getCollocations).toHaveBeenCalledTimes(2);
		expect(mock.api.getCollocations.mock.calls[1][1]).toMatchObject({ first: 20, number: 20, patt: '[word="water"]', sort: 'score' });
		expect(mock.api.getCollocations.mock.calls[1][1]).not.toHaveProperty('viewgroup');
	});

	test.each(['empty', 'error'])('can return from %s collocation contexts to the previous list page', async outcome => {
		Object.assign(mock.params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		mock.store!.actions.range({ first: 40, number: 20 });
		mock.store!.actions.sort('size');
		mock.makeRows.mockReturnValue({ rows: [{ type: 'group' }] });
		const wrapper = mountView();
		mock.requests[0].resolve(collocationResult('[word="water"]'));
		await flush();
		wrapper.findComponent({ name: 'GenericTable' }).vm.$emit('viewgroup', 'ship', 'ship');
		await nextTick();
		if (outcome === 'error') mock.requests[1].reject({ title: 'failure', isCancelledRequest: false });
		else {
			mock.makeRows.mockReturnValue({ rows: [] });
			mock.requests[1].resolve(result('empty', 0, 0));
		}
		await flush();
		await wrapper
			.findAll('button')
			.find(button => button.text().includes('backToCollocations'))!
			.trigger('click');
		expect(mock.store!.getState()).toMatchObject({ first: 40, number: 20, viewGroup: null, sort: 'size' });
		expect(mock.api.getCollocations.mock.calls.at(-1)?.[1]).toMatchObject({ first: 40, sort: 'size' });
	});

	test('changes the collocation scorer from the results controls and reruns from the first page', async () => {
		Object.assign(mock.params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		mock.store!.actions.range({ first: 40, number: 20 });
		mock.makeRows.mockReturnValue({ rows: [{ type: 'group' }] });
		const wrapper = mountView();
		mock.requests[0].resolve(collocationResult('[word="water"]'));
		await flush();

		const scorerToggle = wrapper.findComponent({ name: 'CollocationScorerToggle' });
		expect(scorerToggle.props()).toMatchObject({ disabled: false, modelValue: 'coll-dice' });

		scorerToggle.vm.$emit('update:modelValue', 'coll-salience');
		await nextTick();
		expect(mock.store!.getState()).toMatchObject({ collocationScorer: 'coll-salience', first: 0 });
		expect(mock.api.getCollocations).toHaveBeenCalledTimes(2);
		expect(mock.api.getCollocations.mock.calls[1][1]).toMatchObject({ first: 0, scorertype: 'coll-salience' });
	});

	test('formats collocation failures as grouped and keeps incompatible controls hidden after clearing the result', async () => {
		Object.assign(mock.params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		mock.store!.actions.groupBy(['stale']);
		mock.store!.actions.collocationScorer('coll-salience');
		const wrapper = mountView();
		mock.requests[0].reject({ title: 'failure', isCancelledRequest: false });
		await flush();

		expect((mock.customizations as { formatError: ReturnType<typeof vi.fn> }).formatError).toHaveBeenCalledWith(expect.anything(), 'groups');
		expect(wrapper.findAllComponents({ name: 'GroupBy' })).toHaveLength(0);
		expect(wrapper.findComponent({ name: 'Export' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'Totals' }).exists()).toBe(false);
		const scorerToggle = wrapper.findComponent({ name: 'CollocationScorerToggle' });
		expect(scorerToggle.props('modelValue')).toBe('coll-salience');
		scorerToggle.vm.$emit('update:modelValue', 'coll-dice');
		await nextTick();
		expect(mock.api.getCollocations.mock.calls.at(-1)?.[1]).toMatchObject({ scorertype: 'coll-dice' });
	});

	test('renders invalid, loading, cancelled, error, retry, and empty states', async () => {
		(mock.params as { patt?: string }).patt = undefined;
		let wrapper = mountView();
		expect(mock.api.getHits).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('results.resultsView.inactiveView');
		wrapper.unmount();

		mock.store = ResultsStore.createViewModule(() => (mock.globalState as { pageSize: number }).pageSize);
		(mock.params as { patt?: string }).patt = 'first';
		wrapper = mountView();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(true);
		mock.requests[0].reject({ title: 'cancelled', isCancelledRequest: true });
		await flush();
		expect((mock.customizations as { formatError: ReturnType<typeof vi.fn> }).formatError).not.toHaveBeenCalled();
		expect(wrapper.find('.no-results-found').exists()).toBe(false);
		wrapper.unmount();

		mock.store = ResultsStore.createViewModule(() => (mock.globalState as { pageSize: number }).pageSize);
		wrapper = mountView();
		mock.requests[1].reject({ title: 'failure', isCancelledRequest: false });
		await flush();
		expect(wrapper.text()).toContain('formatted error');
		await wrapper.find('.no-results-found button').trigger('click');
		expect(mock.requests).toHaveLength(3);

		mock.makeRows.mockReturnValue({ rows: [] });
		mock.requests[2].resolve(result('empty', 0, 0));
		await flush();
		expect(wrapper.text()).toContain('results.resultsView.noResultsFound');
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);
	});

	test('builds sortable breadcrumbs and deactivates grouping, sampling, and sorting from the root crumb', async () => {
		mock.store!.actions.groupBy(['capture']);
		mock.store!.actions.sort('word');
		(mock.globalState as { sampleSize: number | null }).sampleSize = 25;
		const wrapper = mountView();
		mock.requests[0].resolve(result('first'));
		await flush();

		const crumbs = wrapper.findComponent({ name: 'BreadCrumbs' }).props('crumbs') as Array<{ label: string; onClick?: () => void }>;
		expect(crumbs.map(crumb => crumb.label)).toEqual([
			'results.resultsView.navigation.hits',
			'results.resultsView.navigation.groupedBy',
			'results.resultsView.navigation.randomSample',
			'results.resultsView.navigation.sortedBy',
		]);
		crumbs.at(-1)!.onClick!();
		expect(mock.store!.getState().sort).toBe('-word');
		crumbs[0].onClick!();
		expect(mock.store!.getState()).toMatchObject({ groupBy: [], sort: null });
		expect(mock.sampleSize).toHaveBeenCalledWith(null);
		expect((mock.globalState as { sampleSize: number | null }).sampleSize).toBeNull();
	});
});

test('does not request documents before active search parameters are available', async () => {
	shallowMount(ResultsView, {
		global: { plugins: [provideMockActiveSearchParameters(ref(undefined))] },
		props: { id: 'docs', active: true, store: mock.store! },
	});
	await flush();
	expect(mock.api.getDocs).not.toHaveBeenCalled();
});

test('uses the displayed page size for page clicks when the preference has changed', async () => {
	mock.store!.actions.range({ first: 40, number: 20 });
	const wrapper = mountView();
	mock.requests[0].resolve(result('first'));
	await flush();
	(mock.globalState as { pageSize: number }).pageSize = 50;
	await nextTick();
	const pagination = wrapper.findComponent({ name: 'Pagination' });
	expect(pagination.props('page')).toBe(0);
	pagination.vm.$emit('change', 3);
	await nextTick();
	expect(mock.store!.getState()).toMatchObject({ first: 150, number: 50 });
});
