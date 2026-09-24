// @vitest-environment jsdom

import { createMockApi, rejectedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, shallowRef, type Ref } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import { ContainerRenderer, createCollocationTarget, filterTextController, FormBuilder, FormRuntime, TextField, type CompiledFormResult } from '@/features/form';
import * as HistoryStore from '@/features/history/model/query-history-state';
import { createActiveSearch } from '@/features/search/model/active-search';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import { LegacyFormRestorer } from '@/features/search/model/form/restore-legacy-form';
import * as GlobalStore from '@/features/search/model/results/global-results-state';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSearchFormRestoration } from '@/features/search/model/search-form-restoration';
import { createSearchSummary } from '@/features/search/model/search-summary';
import { createSubmittedFormRestoration, createSubmittedSearch } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';
import { queryHistoryDetails } from '@/url/query-history';
import { createSearchUrlBinding } from '@/url/search-state';

import { CancelableRequest, type BlackLabApi } from '@/shared/api/lib/api-types';

const cleanup: (() => void)[] = [];
const base = '/blacklab-frontend';
const path = '/test-corpus/search';
const pattern = '[word="water"]';
const corpus = {
	id: 'test-corpus',
	mainAnnotatedField: 'contents',
	firstMainAnnotation: { id: 'word', uiType: 'text' },
	allAnnotations: [],
	allAnnotationsMap: {},
	allMetadataFields: [],
	allMetadataFieldsMap: {},
	allAnnotatedFieldsMap: { contents: { annotations: {} } },
	parallelAnnotatedFields: [],
	parallelAnnotatedFieldsMap: {},
	relations: { spans: {} },
	isParallelCorpus: false,
} as unknown as Corpus;
const customizations = createCustomizations(createCustomizationRegistry(corpus), corpus, UIStore.getState, () => {});

function form({ withField = false, collocations = false } = {}) {
	const builder = new FormBuilder({ corpus: { indexId: corpus.id!, textDirection: 'ltr', isParallelCorpus: false }, translate: createMockTranslate() });
	const node = builder.newForm('search.simple', ContainerRenderer, collocations ? { target: createCollocationTarget('word') } : {});
	if (withField) node.addChildren(builder.newField('late', filterTextController, TextField, { displayName: 'Author', metadataFieldId: 'late' }));
	return new FormRuntime(builder);
}

function submittedQuery(patt = pattern): CompiledFormResult {
	return { formId: 'search.simple', encoded: { 'f.form': 'search.simple' }, params: { patt }, issues: [], summaries: [] };
}
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(done => {
		resolve = done;
	});
	return { promise, resolve };
}

async function setup(
	url = `${path}/hits?patt=${encodeURIComponent(pattern)}&f.form=search.simple`,
	{
		beforeStateLoaded = () => Promise.resolve(),
		// Unsupported BCQL must survive as a raw pattern when BlackLab cannot parse it.
		getParsePattern = () => rejectedRequest('unsupported pattern'),
	}: { beforeStateLoaded?: () => Promise<unknown>; getParsePattern?: BlackLabApi['getParsePattern'] } = {},
) {
	window.history.replaceState({}, '', base + url);
	const router = createRouter({
		history: createWebHistory(base),
		routes: [
			{ name: 'search', path: '/:corpus/search/:results?', component: { template: '<div />' } },
			{ name: 'article', path: '/:corpus/docs/:docId', component: { template: '<div />' } },
		],
	});
	await router.push(url);
	const runtime = shallowRef<FormRuntime | null>(form());
	const loadedCorpus = shallowRef<Corpus | undefined>(corpus);
	const submittedSearch = createSubmittedSearch();
	RootStore.setSubmittedSearch(submittedSearch);
	const activeSearch = createActiveSearch(InterfaceStore.get.viewedResults, {
		corpus: loadedCorpus,
		submitted: submittedSearch,
		global: GlobalStore.getState,
		viewState: () => {
			const view = InterfaceStore.get.viewedResults();
			return view ? ViewStore.getOrCreateModule(view).getState() : undefined;
		},
		expandedRequestRange: () => {
			const view = InterfaceStore.get.viewedResults();
			return typeof view === 'string' && view ? ViewStore.getOrCreateModule(view).get.expandedRequestRange() : undefined;
		},
		withSpans: customizations.searchWithSpans,
		debug: false,
	});
	const activeSearchParameters = activeSearch.parameters;
	const restoredForm = createSubmittedFormRestoration(submittedSearch, runtime);
	const summary = createSearchSummary(submittedSearch, restoredForm);
	const formRestoration = createSearchFormRestoration({
		corpus: loadedCorpus,
		runtime,
		submitted: submittedSearch,
		restoredForm,
		beforeStateLoaded,
		restoreLegacy: (corpus, submitted) => {
			const viewedResults = InterfaceStore.get.viewedResults();
			const view = viewedResults ? ViewStore.getOrCreateModule(viewedResults).getState() : null;
			return new LegacyFormRestorer(
				{ blacklabApi: createMockApi({ blacklab: { getParsePattern } }).blacklabApi, corpus, customizations, filterState: FilterStore.getState(), tagsetState: TagsetStore.getState() },
				{
					submitted,
					viewedResults,
					groupBy: view?.groupBy ?? [],
					groupDisplayMode: view?.groupDisplayMode ?? null,
				},
			).get();
		},
	});
	const controller = createSearchUrlBinding(router, { corpus: loadedCorpus, submittedSearch, restoreForms: formRestoration.restore, summary });

	const sync = {
		...controller,
		run: async (change: () => unknown) => {
			change();
			await nextTick();
			await flushPromises();
		},
	};
	cleanup.push(() => {
		sync.stop();
		formRestoration.stop();
		router.options.history.destroy();
	});
	return { router, runtime, loadedCorpus, sync, activeSearchParameters };
}

async function restored(activeSearchParameters: Readonly<Ref<EffectiveSearchParameters | undefined>>, patt = pattern) {
	await flushPromises();
	await vi.waitFor(() => expect(activeSearchParameters.value?.patt).toBe(patt));
}

beforeEach(() => {
	ViewStore.setPageSizePreference(() => GlobalStore.getState().pageSize);
	vi.stubGlobal('CONTEXT_URL', base);
	RootStore.setCustomizations(customizations);
	const context = { index: corpus } as CorpusContext;
	InterfaceStore.actions.reset();
	ExploreStore.actions.reset();
	FilterStore.init({} as CorpusContext);
	PatternStore.init(context, customizations);
	GlobalStore.init(context);
	GlobalStore.actions.pageSize(20);
	ViewStore.init(context);
	HistoryStore.setUrlDecoder(queryHistoryDetails);
	HistoryStore.init(context);
});
afterEach(() => {
	cleanup
		.splice(0)
		.reverse()
		.forEach(stop => stop());
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('search URLs and browser history', () => {
	test('waits for the incoming search form to finish restoring before the initial page is ready', async () => {
		const gate = deferred();
		const { activeSearchParameters, sync } = await setup(undefined, { beforeStateLoaded: () => gate.promise });

		expect(sync.initialReadSettled.value).toBe(false);
		gate.resolve();
		await restored(activeSearchParameters);
		expect(sync.initialReadSettled.value).toBe(true);
	});

	test.each(['sample=25', 'samplenum=8'])('shares a generated sampling seed across requests, controls, and pagination for %s', async sampling => {
		const { router, activeSearchParameters, sync } = await setup(`${path}/hits?patt=${encodeURIComponent(pattern)}&${sampling}`);
		await restored(activeSearchParameters);
		const seed = activeSearchParameters.value?.sampleseed;
		expect(Number.isSafeInteger(seed)).toBe(true);
		expect(router.currentRoute.value.query.sampleseed).toBe(String(seed));
		expect(GlobalStore.getState().sampleSeed).toBe(seed);
		await sync.run(() => ViewStore.getOrCreateModule('hits').actions.first(20));
		expect(activeSearchParameters.value).toMatchObject({ first: 20, sampleseed: seed });
		expect(router.currentRoute.value.query.sampleseed).toBe(String(seed));
	});

	test.each([
		{ form: 'search', patternMode: 'expert' },
		{ form: 'explore', exploreMode: 'frequency' },
	])('keeps the other form usable when a saved interface only specifies $form settings', async ui => {
		await setup(`${path}/hits?interface=${encodeURIComponent(JSON.stringify(ui))}`);
		await flushPromises();
		InterfaceStore.actions.form(ui.form === 'search' ? 'explore' : 'search');
		expect(InterfaceStore.getState()).toMatchObject({ patternMode: ui.patternMode ?? 'simple', exploreMode: ui.exploreMode ?? 'corpora' });
	});

	test('preserves readable history summaries for legacy searches', async () => {
		const { runtime, loadedCorpus, sync, activeSearchParameters } = await setup(`${path}/hits?patt=[]&group=hit:word`);
		runtime.value = null;
		loadedCorpus.value = { ...corpus, allAnnotationsMap: { word: { ...corpus.firstMainAnnotation, defaultDisplayName: 'Word' } } };
		await restored(activeSearchParameters, '[]');
		await sync.run(() => ViewStore.getOrCreateModule('hits').actions.first(20));
		expect(HistoryStore.getState()[0].displayValues.pattern).toBe('Word frequency');
	});

	test('one submit publishes its completed query and result settings; Back and Forward restore each URL', async () => {
		const { sync, router, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		const original = window.location.href;
		const length = window.history.length;
		await sync.run(() => RootStore.actions.searchFromSubmit(submittedQuery('[word="ship"]')));
		const submitted = window.location.href;
		expect(new URL(submitted).searchParams.get('patt')).toBe('[word="ship"]');
		expect(window.history.length).toBe(length + 1);
		await sync.run(() => {
			const view = ViewStore.getOrCreateModule('hits');
			view.actions.groupBy(['hit:word']);
			view.actions.range({ first: 40, number: 20 });
			view.actions.sort('-size');
		});
		const grouped = window.location.href;
		expect(new URL(grouped).searchParams.get('first')).toBe('40');
		expect(new URL(grouped).searchParams.get('group')).toBe('hit:word');
		expect(window.history.length).toBe(length + 2);
		router.back();
		await vi.waitFor(() => expect(window.location.href).toBe(submitted));
		await vi.waitFor(() => expect(ViewStore.getOrCreateModule('hits').getState().groupBy).toEqual([]));
		router.back();
		await vi.waitFor(() => expect(window.location.href).toBe(original));
		await restored(activeSearchParameters);
		router.forward();
		await restored(activeSearchParameters, '[word="ship"]');
		expect(window.location.href).toBe(submitted);
		router.forward();
		await vi.waitFor(() => expect(ViewStore.getOrCreateModule('hits').getState().first).toBe(40));
		expect(window.location.href).toBe(grouped);
		expect(window.history.length).toBe(length + 2);
	});

	test('legacy submissions and pagination save their summary without reparsing the URL or reading a newer draft', async () => {
		const getParsePattern = vi.fn<BlackLabApi['getParsePattern']>(() => rejectedRequest('unsupported pattern'));
		const { sync, runtime } = await setup(path, { getParsePattern });
		runtime.value = null;
		await flushPromises();
		InterfaceStore.actions.patternMode('expert');
		PatternStore.actions.expert.query('[word="saved"]');
		await sync.run(() => RootStore.actions.searchFromSubmit());
		expect(HistoryStore.getState()[0].displayValues.pattern).toBe('[word="saved"]');
		PatternStore.actions.expert.query('[word="draft"]');
		await sync.run(() => ViewStore.getOrCreateModule('hits').actions.first(20));
		expect(HistoryStore.getState()[0].displayValues.pattern).toBe('[word="saved"]');
		expect(getParsePattern).not.toHaveBeenCalled();
	});

	test('a replacement form supersedes pending parsing and restores only the current URL', async () => {
		const pending = deferred();
		const entered = deferred();
		const { runtime, router, activeSearchParameters } = await setup(undefined, {
			getParsePattern: (_indexId, patt) => {
				if (patt !== pattern) return rejectedRequest('unsupported pattern');
				entered.resolve();
				return new CancelableRequest(
					pending.promise.then(() => rejectedRequest('unsupported pattern')),
					() => {},
				);
			},
		});
		await entered.promise;
		await router.push(`${path}/hits?patt=${encodeURIComponent('[word="new definition"]')}&f.form=search.simple&f.late=author`);
		runtime.value = form({ withField: true });
		await restored(activeSearchParameters, '[word="new definition"]');
		pending.resolve();
		await flushPromises();
		expect(runtime.value.state.state.value.late).toEqual({ value: 'author', caseSensitive: false });
		expect(activeSearchParameters.value?.patt).toBe('[word="new definition"]');
	});

	test('replacing a form discards its draft without submitting or changing collocation controls', async () => {
		const { runtime, sync, activeSearchParameters } = await setup(path);
		runtime.value = form({ collocations: true, withField: true });
		await nextTick();
		const params = {
			patt: pattern,
			collpatt: '[word="sea"]',
			filter: 'author:Austen',
			searchfield: 'contents',
			colltype: 'proximity' as const,
			context: '3:4',
			within: 's',
			annotation: 'word',
			sensitive: true,
			scorertype: 'coll-dice' as const,
		};
		await sync.run(() => {
			const query = RootStore.actions.searchFromSubmit({ ...submittedQuery(), params });
			GlobalStore.actions.sampleSeed(123);
			GlobalStore.actions.sampleSize(25);
			const view = ViewStore.getOrCreateModule('hits');
			view.actions.collocationScorer('coll-salience');
			view.actions.viewGroup('word:ship');
			view.actions.sort('-size');
			return query;
		});
		const url = window.location.href;
		expect(Object.fromEntries(new URL(url).searchParams)).toMatchObject({
			...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
			scorertype: 'coll-salience',
			viewgroup: 'word:ship',
			sort: '-size',
			sample: '25',
			sampleseed: '123',
			first: '0',
			number: '20',
		});
		const history = [...HistoryStore.getState()];
		const browserEntries = window.history.length;
		runtime.value!.state.state.value.late = { value: 'unsent draft', caseSensitive: false };
		runtime.value = form({ collocations: true, withField: true });
		await nextTick();
		await restored(activeSearchParameters);
		expect(runtime.value.state.state.value.late).not.toEqual({ value: 'unsent draft', caseSensitive: false });
		expect(HistoryStore.getState()).toEqual(history);
		expect(window.history.length).toBe(browserEntries);
		expect(activeSearchParameters.value).toMatchObject({ ...params, scorertype: 'coll-salience', viewgroup: 'word:ship', sort: '-size', sample: 25, sampleseed: 123 });
		expect(window.location.href).toBe(url);
	});

	test('opening a saved search restores the visible form even when its URL is already current', async () => {
		const { runtime, sync, activeSearchParameters } = await setup();
		runtime.value = form({ withField: true });
		await restored(activeSearchParameters);
		runtime.value.state.state.value.late = { value: 'saved', caseSensitive: false };
		await sync.run(() => RootStore.actions.searchFromSubmit(runtime.value!.compile('search.simple')));
		const entry = HistoryStore.getState()[0];
		const url = window.location.href;
		runtime.value.state.state.value.late = { value: 'unsent draft', caseSensitive: false };
		await sync.open(entry.url);
		expect(runtime.value.state.state.value.late).toEqual({ value: 'saved', caseSensitive: false });
		expect(activeSearchParameters.value?.filter).toBe('late:(saved)');
		expect(window.location.href).toBe(url);
	});

	test('keeps independent ordinary and custom ranges across resize and view switches', async () => {
		const { sync, router, activeSearchParameters } = await setup(`${path}/hits?patt=[word=%22water%22]&first=40&number=20`);
		await restored(activeSearchParameters);
		const hits = ViewStore.getOrCreateModule('hits');
		const docs = ViewStore.getOrCreateModule('docs');
		const url = router.currentRoute.value.fullPath;
		await sync.run(() => docs.actions.range({ first: 45, number: 30 }));
		expect(router.currentRoute.value.fullPath).toBe(url);
		await sync.run(() => GlobalStore.actions.pageSize(50));
		expect(hits.get.selectedRange()).toEqual({ first: 0, number: 50 });
		expect(docs.get.selectedRange()).toEqual({ first: 45, number: 30 });
		await sync.run(() => void InterfaceStore.actions.viewedResults('docs'));
		expect(activeSearchParameters.value).toMatchObject({ first: 0, number: 100 });
		await sync.run(() => void InterfaceStore.actions.viewedResults('hits'));
		expect(activeSearchParameters.value).toMatchObject({ first: 0, number: 50 });
		expect(docs.get.selectedRange()).toEqual({ first: 45, number: 30 });
	});

	test('submitting a new query resets every view to the preferred first page', async () => {
		const { sync, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		ViewStore.getOrCreateModule('hits').actions.range({ first: 40, number: 20 });
		ViewStore.getOrCreateModule('docs').actions.range({ first: 45, number: 30 });
		GlobalStore.actions.pageSize(50);
		await sync.run(() => RootStore.actions.searchFromSubmit(submittedQuery('[word="new"]')));
		expect(activeSearchParameters.value).toMatchObject({ patt: '[word="new"]', first: 0, number: 50 });
		for (const name of ['hits', 'docs']) expect(ViewStore.getOrCreateModule(name).get.selectedRange()).toEqual({ first: 0, number: 50 });
	});

	test('submitting a documents query removes legacy pattern aliases from the projection', async () => {
		const incoming = `${path}/hits?query=${encodeURIComponent(pattern)}&field=contents&extension=shared#results`;
		const { sync, router, activeSearchParameters } = await setup(incoming);
		const browserEntries = window.history.length;
		await restored(activeSearchParameters);
		expect(router.currentRoute.value.fullPath).toBe(incoming);
		expect(window.history.length).toBe(browserEntries);
		await sync.run(() => RootStore.actions.searchFromSubmit({ ...submittedQuery(), params: {} }));
		expect(router.currentRoute.value.query).not.toHaveProperty('query');
		expect(router.currentRoute.value.query).not.toHaveProperty('field');
		expect(router.currentRoute.value.query.extension).toBe('shared');
		expect(router.currentRoute.value.hash).toBe('#results');
		await sync.open(router.currentRoute.value.fullPath);
		expect(activeSearchParameters.value?.patt).toBeUndefined();
	});

	test('opening a saved search resets inactive result controls to their defaults', async () => {
		const { sync, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		const hits = ViewStore.getOrCreateModule('hits');
		hits.actions.groupBy(['hit:word']);
		hits.actions.sort('-size');
		hits.actions.range({ first: 45, number: 30 });
		GlobalStore.actions.pageSize(50);
		await sync.open(`${path}/docs?patt=${encodeURIComponent(pattern)}&first=105&number=10&sort=field:title`);
		await flushPromises();
		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(hits.getState()).toMatchObject({ first: 0, number: 50, groupBy: [], sort: null, viewGroup: null });
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({ first: 105, number: 10, sort: 'field:title' });
		expect(activeSearchParameters.value).toMatchObject({ first: 100, number: 50 });
	});
	test.each(['hits', 'docs'])('opening a %s URL hydrates only that view and expands its selection', async view => {
		for (const name of ['hits', 'docs']) {
			ViewStore.getOrCreateModule(name).actions.range({ first: 200, number: 20 });
			ViewStore.getOrCreateModule(name).actions.sort('-size');
		}
		const { router, activeSearchParameters } = await setup(`${path}/${view}?patt=${encodeURIComponent(pattern)}&first=45&number=30`);
		await restored(activeSearchParameters);
		expect(InterfaceStore.get.viewedResults()).toBe(view);
		expect(ViewStore.getOrCreateModule(view).get.selectedRange()).toEqual({ first: 45, number: 30 });
		expect(ViewStore.getOrCreateModule(view === 'hits' ? 'docs' : 'hits').getState()).toMatchObject({ first: 0, number: 20, sort: null });
		expect(activeSearchParameters.value).toMatchObject({ first: 40, number: 40 });
		expect(router.currentRoute.value.query).toMatchObject({ first: '45', number: '30' });
	});

	test('editing a draft leaves results and URL unchanged, including after a result control changes', async () => {
		const { runtime, sync, router, activeSearchParameters } = await setup(`${path}/hits?patt=${encodeURIComponent(pattern)}&f.form=search.simple&f.late=saved&filter=late%3A%28saved%29`);
		runtime.value = form({ withField: true });
		await restored(activeSearchParameters);
		const url = router.currentRoute.value.fullPath;
		runtime.value.state.state.value.late = { value: 'draft', caseSensitive: false };
		await flushPromises();
		expect(router.currentRoute.value.fullPath).toBe(url);
		expect(activeSearchParameters.value).toMatchObject({ patt: pattern, filter: 'late:(saved)' });
		await sync.run(() => ViewStore.getOrCreateModule('hits').actions.sort('hit:word'));
		expect(router.currentRoute.value.query).toMatchObject({ 'f.late': 'saved', filter: 'late:(saved)', sort: 'hit:word' });
		expect(runtime.value.state.state.value.late).toEqual({ value: 'draft', caseSensitive: false });
		expect(activeSearchParameters.value).toMatchObject({ patt: pattern, filter: 'late:(saved)', sort: 'hit:word' });
	});

	test('results use the URL query and range while its form is still loading', async () => {
		const pending = deferred();
		const filter = 'unconfigured:(kept)';
		const { sync, router, activeSearchParameters } = await setup(`${path}/hits?patt=${encodeURIComponent(pattern)}&filter=${encodeURIComponent(filter)}&first=45&number=30&group=hit:word&sort=-size`, {
			beforeStateLoaded: () => pending.promise,
		});
		expect(activeSearchParameters.value).toMatchObject({ patt: pattern, filter, first: 40, number: 40, group: 'hit:word', sort: '-size' });
		await sync.run(() => ViewStore.getOrCreateModule('hits').actions.range({ first: 80, number: 20 }));
		pending.resolve();
		await restored(activeSearchParameters);
		expect(activeSearchParameters.value).toMatchObject({ patt: pattern, filter, first: 80, number: 20, group: 'hit:word', sort: '-size' });
		expect(router.currentRoute.value.query).toMatchObject({ patt: pattern, filter, first: '80', number: '20' });
	});

	test('reset clears the submitted search and URL', async () => {
		const { sync, router, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		await sync.run(() => RootStore.actions.reset());
		expect(activeSearchParameters.value).toBeUndefined();
		expect(InterfaceStore.get.viewedResults()).toBeNull();
		expect(router.currentRoute.value.path).toBe(path);
		expect(router.currentRoute.value.query).toEqual({});
	});

	test('rapid navigation and leaving search cancel stale reads', async () => {
		const pending = deferred();
		let wait = true;
		const { router, activeSearchParameters } = await setup(undefined, { beforeStateLoaded: () => (wait ? pending.promise : Promise.resolve()) });
		wait = false;
		await router.push(`${path}/hits?patt=${encodeURIComponent('[word="latest"]')}`);
		await restored(activeSearchParameters, '[word="latest"]');
		await router.push('/test-corpus/docs/article');
		pending.resolve();
		await flushPromises();
		expect(window.location.pathname).toBe(base + '/test-corpus/docs/article');
		expect(activeSearchParameters.value).toBeUndefined();
	});
});
