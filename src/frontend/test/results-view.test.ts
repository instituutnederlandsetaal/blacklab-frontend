// @vitest-environment jsdom

import { enableAutoUnmount, mount, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';

import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as ResultsStore from '@/features/search/model/results/view-state';
import type { ViewModule } from '@/features/search/model/results/view-state';
import type { BLSearchResult } from '@/types/blacklabtypes';

import Results from '@/pages/search/results/Results.vue';
import ResultsView from '@/pages/search/results/ResultsView.vue';

enableAutoUnmount(afterEach);

const mock = vi.hoisted(() => ({
	api: { getHits: vi.fn(), getDocs: vi.fn() },
	corpus: undefined as unknown,
	customizations: undefined as unknown,
	globalState: undefined as unknown,
	params: undefined as unknown,
	queryState: undefined as unknown,
	requests: [] as Array<ReturnType<typeof deferredRequest>>,
	sampleSize: vi.fn(),
	store: undefined as ViewModule | undefined,
	makeColumns: vi.fn(),
	makeRows: vi.fn(),
}));

vi.mock('@/app/state/root-store', () => ({
	get: {
		blacklabParameters: () => {
			const view = mock.store?.getState();
			return {
				...(mock.params as Record<string, unknown>),
				group: view?.groupBy.length ? view.groupBy.join(',') : undefined,
				first: view?.first,
				number: view?.number,
				sort: view?.sort ?? undefined,
				viewgroup: view?.viewGroup ?? undefined,
			};
		},
	},
}));
vi.mock('@/app/state/useCorpusContext', () => ({ useCorpus: () => ref(mock.corpus) }));
vi.mock('@/customization-api/internal/internal-api', () => ({ useCustomizations: () => mock.customizations }));
vi.mock('@/features/search/model/query-state', () => ({
	getState: () => mock.queryState,
	get: { sourceField: () => 'contents' },
}));
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

async function flush() {
	await Promise.resolve();
	await Promise.resolve();
	await nextTick();
}

function mountView(active = true) {
	return shallowMount(ResultsView, { props: { id: 'hits', active, store: mock.store! } });
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
	ResultsStore.getOrCreateModule('hits').actions.reset({ resetGroupBy: true });
	mock.store = ResultsStore.createViewModule('test');
	mock.params = reactive({ patt: 'first' });
	mock.queryState = reactive({ form: 'new' });
	mock.globalState = reactive({ pageSize: 20, sampleMode: 'percentage', sampleSize: null });
	const annotation = { id: 'word', isInternal: false, hasForwardIndex: true };
	const dependencyAnnotation = { id: 'lemma', isInternal: false, hasForwardIndex: true };
	const sourceField = { id: 'contents' };
	const targetField = { id: 'parallel', isParallel: true };
	const metadata = { id: 'title' };
	mock.corpus = {
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
	mock.api.getHits.mockImplementation(() => {
		const request = deferredRequest();
		mock.requests.push(request);
		return request.request;
	});
	mock.api.getDocs.mockImplementation(mock.api.getHits);
	mock.makeColumns.mockReturnValue({ hitColumns: [], docColumns: [], groupColumns: [], groupModeOptions: [] });
	mock.makeRows.mockReturnValue({ rows: [{ type: 'hit' }] });
	Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get: () => 320 });
	vi.spyOn(window, 'scroll').mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('Results tabs', () => {
	test('mounts only the hits tab and component for an effective collocation request', async () => {
		InterfaceStore.actions.viewedResults('hits');
		Object.assign(mock.params as object, {
			patt: '[word="water"]',
			colltype: 'proximity',
			context: 5,
			annotation: 'lemma',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		const wrapper = mount(Results);

		expect(wrapper.findAll('#resultTabs li')).toHaveLength(1);
		expect(wrapper.find('.hits-result').exists()).toBe(true);
		expect(wrapper.find('.docs-result').exists()).toBe(false);

		delete (mock.params as Record<string, unknown>).colltype;
		await nextTick();
		expect(wrapper.findAll('#resultTabs li')).toHaveLength(2);
		expect(wrapper.find('.docs-result').exists()).toBe(true);
	});
});

describe('ResultsView', () => {
	test('defers dirty inactive views and refreshes when activated', async () => {
		const wrapper = mountView(false);
		expect(mock.api.getHits).not.toHaveBeenCalled();

		(mock.params as { patt: string }).patt = 'changed';
		await nextTick();
		expect(mock.api.getHits).not.toHaveBeenCalled();

		await wrapper.setProps({ active: true });
		expect(mock.api.getHits).toHaveBeenCalledOnce();
	});

	test('ignores a stale cancellation across an A-B-A request race', async () => {
		const wrapper = mountView();
		const stale = mock.requests[0];
		(mock.params as { patt: string }).patt = 'second';
		await nextTick();
		(mock.params as { patt: string }).patt = 'first';
		await nextTick();

		expect(stale.request.cancel).toHaveBeenCalledOnce();
		expect(mock.requests).toHaveLength(3);
		stale.reject({ title: 'cancelled', isCancelledRequest: true });
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

	test('ignores a stale success across an A-B-A request race', async () => {
		const wrapper = mountView();
		const stale = mock.requests[0];
		(mock.params as { patt: string }).patt = 'second';
		await nextTick();
		(mock.params as { patt: string }).patt = 'first';
		await nextTick();

		expect(stale.request.cancel).toHaveBeenCalledOnce();
		stale.resolve(result('stale'));
		await flush();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(true);
		expect(wrapper.findComponent({ name: 'GenericTable' }).exists()).toBe(false);

		mock.requests[2].resolve(result('first'));
		await flush();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(false);
		expect(wrapper.findComponent({ name: 'GenericTable' }).props()).toMatchObject({ query: expect.objectContaining({ patt: 'first' }), disabled: false });
	});

	test('clears an invalid capture grouping and retries after the grouped error', async () => {
		mock.store!.actions.groupBy(['capture']);
		mountView();
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

		expect(() => vi.advanceTimersByTime(1500)).not.toThrow();
		pending.resolve(result('first'));
		await flush();
		expect(mock.makeRows).not.toHaveBeenCalled();
		expect(window.scroll).not.toHaveBeenCalled();
	});

	test('passes complete shared render settings and result props through the table, totals, export, and range pagination', async () => {
		mock.store!.actions.range({ first: 15, number: 30 });
		mock.store!.actions.setRequestedRange({ first: 15, number: 30 });
		const wrapper = mountView();
		const currentResult = result('first');
		mock.requests[0].resolve(currentResult);
		await flush();

		const settings = mock.makeRows.mock.calls[0][1];
		expect(mock.makeColumns.mock.calls[0][1]).toBe(settings);
		expect(settings).toMatchObject({
			indexId: 'test',
			mainAnnotation: { id: 'word' },
			otherAnnotations: [{ id: 'lemma' }],
			detailedAnnotations: [{ id: 'word' }],
			dependencyAnnotations: [{ id: 'lemma' }],
			dependencyRelationClass: 'dep',
			sortableAnnotations: [{ id: 'word' }],
			annotationGroups: [{ id: 'main' }],
			metadata: [{ id: 'title' }],
			sourceField: { id: 'contents' },
			targetFields: [{ id: 'parallel' }],
			specialFields: { pidField: 'pid' },
			dir: 'ltr',
			html: true,
			groupDisplayMode: 'docs',
			requestedRange: { first: 15, number: 30 },
		});
		expect(settings).toEqual(
			expect.objectContaining({ getSummary: expect.any(Function), hasCustomHitInfoColumn: expect.any(Function), getCustomHitInfo: expect.any(Function), i18n: expect.any(Object) }),
		);
		(settings as { getCustomHitInfo: (...args: unknown[]) => string }).getCustomHitInfo({}, {}, {});
		expect((mock.customizations as { hitInfoColumnContent: ReturnType<typeof vi.fn> }).hitInfoColumnContent).toHaveBeenCalledWith({}, {}, {}, expect.objectContaining({ $t: expect.any(Function) }));

		const columns = mock.makeColumns.mock.results[0].value;
		const rows = mock.makeRows.mock.results[0].value;
		const table = wrapper.findComponent({ name: 'GenericTable' });
		expect(table.props()).toMatchObject({ cols: columns, rows, header: columns.hitColumns, info: settings, query: currentResult.summary.params, sort: null, type: 'hits', disabled: false });
		const totals = wrapper.findComponent({ name: 'Totals' });
		expect(totals.props()).toMatchObject({ initialResults: currentResult, type: 'hits', indexId: 'test', annotatedFieldId: 'contents' });

		const pagination = wrapper.findAllComponents({ name: 'Pagination' })[0];
		expect(pagination.props()).toMatchObject({ page: 0, page2: 2, maxPage: 5 });
		const countedResult = result('counted', 205);
		totals.vm.$emit('update', countedResult);
		await nextTick();
		expect(wrapper.findAllComponents({ name: 'Pagination' })[0].props('maxPage')).toBe(10);
		expect(mock.makeRows).toHaveBeenCalledOnce();
		expect(table.props('rows')).toBe(rows);

		expect(wrapper.findComponent({ name: 'Export' }).props()).toMatchObject({ results: currentResult, type: 'hits', disabled: false });
		expect(window.scroll).toHaveBeenCalledWith({ behavior: 'smooth', top: 170 });
		pagination.vm.$emit('change', 2);
		await nextTick();
		expect(mock.store!.getState()).toMatchObject({ first: 40, number: 20, requestedRange: null });
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

	test('uses alignment sorting by default for ungrouped parallel hits', async () => {
		mock.store = ResultsStore.getOrCreateModule('hits');
		(mock.corpus as { isParallelCorpus: boolean }).isParallelCorpus = true;
		mountView();
		expect(mock.store.getState().sort).toBe('alignments');
		expect(mock.api.getHits.mock.calls[0][1]).toMatchObject({ sort: 'alignments' });

		await nextTick();
		expect(mock.requests[0].request.cancel).toHaveBeenCalledOnce();
		expect(mock.requests).toHaveLength(2);
	});

	test('renders invalid, loading, cancelled, error, retry, and empty states', async () => {
		(mock.params as { patt?: string }).patt = undefined;
		let wrapper = mountView();
		expect(mock.api.getHits).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('results.resultsView.inactiveView');
		wrapper.unmount();

		mock.store = ResultsStore.createViewModule('cancelled');
		(mock.params as { patt?: string }).patt = 'first';
		wrapper = mountView();
		expect(wrapper.findComponent({ name: 'Spinner' }).exists()).toBe(true);
		mock.requests[0].reject({ title: 'cancelled', isCancelledRequest: true });
		await flush();
		expect((mock.customizations as { formatError: ReturnType<typeof vi.fn> }).formatError).not.toHaveBeenCalled();
		expect(wrapper.find('.no-results-found').exists()).toBe(false);
		wrapper.unmount();

		mock.store = ResultsStore.createViewModule('error');
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
