// @vitest-environment jsdom

import { createMockTranslate } from '@test/mocks/i18n';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref, shallowRef, type Ref } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import type { CorpusContext } from '@/features/corpus/corpus-context';
import { ContainerRenderer, createCollocationTarget, filterTextController, FormBuilder, FormRuntime, TextField, type CompiledFormResult } from '@/features/form';
import { createSearchFormBinding } from '@/pages/search/bindings/search-form-binding';
import { createSearchUrlBinding } from '@/pages/search/bindings/search-url-binding';
import * as HistoryStore from '@/pages/search/history/query-history-store';
import type { EffectiveSearchParameters } from '@/pages/search/model/results/result-types';
import { ResultsState } from '@/pages/search/model/results/results-state';
import { createSubmittedSearch, type SubmittedSearchState } from '@/pages/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

import { createCorpus } from './form/search-form-fixture';

let loadedCorpus: Ref<Corpus | undefined>;
let submittedSearch: SubmittedSearchState;
let results: ResultsState;
const cleanup: (() => void)[] = [];
const base = '/blacklab-frontend';
const path = '/test-corpus/search';
const pattern = '[word="water"]';
const corpus = createCorpus();

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
		customizationsReady = ref(true),
		beforeStateLoaded = () => Promise.resolve(),
	}: { customizationsReady?: Ref<boolean>; beforeStateLoaded?: (runtime: Ref<FormRuntime | null>) => Promise<unknown> } = {},
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
	const searchForm = createSearchFormBinding({
		customizationsReady,
		beforeStateLoaded: () => beforeStateLoaded(runtime),
		results,
		corpus: loadedCorpus,
		runtime,
		submitted: submittedSearch,
	});
	const binding = createSearchUrlBinding(router, { corpus: loadedCorpus, search: submittedSearch, form: searchForm, results, onResultsUrl: url => HistoryStore.actions.addEntry({ url }) });

	const sync = {
		...binding,
		run: async (change: () => unknown) => {
			change();
			await nextTick();
			await flushPromises();
		},
	};
	cleanup.push(() => {
		sync.stop();
		searchForm.stop();
		router.options.history.destroy();
	});
	return { router, runtime, loadedCorpus, sync, searchForm, activeSearchParameters: results.parameters, restoring: searchForm.loading };
}

async function restored(activeSearchParameters: Readonly<Ref<EffectiveSearchParameters | undefined>>, patt = pattern) {
	await flushPromises();
	await vi.waitFor(() => expect(activeSearchParameters.value?.patt).toBe(patt));
}

beforeEach(() => {
	loadedCorpus = shallowRef(corpus);
	submittedSearch = createSubmittedSearch();
	results = new ResultsState(
		{
			corpus: loadedCorpus,
			submitted: submittedSearch.current,
			withSpans: () => null,
			debug: false,
		},
		ref(20),
	);
	vi.stubGlobal('CONTEXT_URL', base);
	const context = { index: corpus } as CorpusContext;
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
	test('runs beforeStateLoaded once per corpus even when the hook rebuilds the form', async () => {
		const beforeStateLoaded = vi.fn(async (runtime: Ref<FormRuntime | null>) => {
			runtime.value = form({ withField: true });
		});
		const { router, runtime, loadedCorpus, sync, activeSearchParameters } = await setup(undefined, { beforeStateLoaded });
		await restored(activeSearchParameters);
		expect(beforeStateLoaded).toHaveBeenCalledTimes(1);

		runtime.value = form({ withField: true });
		await sync.run(() => undefined);
		await router.push(`${path}/hits?patt=${encodeURIComponent('[word="later"]')}`);
		await restored(activeSearchParameters, '[word="later"]');
		expect(beforeStateLoaded).toHaveBeenCalledTimes(1);

		loadedCorpus.value = { ...corpus };
		await vi.waitFor(() => expect(beforeStateLoaded).toHaveBeenCalledTimes(2));
	});

	test('waits for corpus scripts to register their hooks before restoring the first search', async () => {
		const customizationsReady = ref(false);
		const configured = vi.fn();
		const { sync, runtime } = await setup(`${path}/docs?f.form=search.simple&f.late=Austen`, {
			customizationsReady,
			beforeStateLoaded: async runtime => {
				configured();
				runtime.value = form({ withField: true });
			},
		});
		await flushPromises();
		expect(configured).not.toHaveBeenCalled();
		expect(sync.initialReadSettled.value).toBe(false);
		customizationsReady.value = true;
		await flushPromises();
		expect(configured).toHaveBeenCalledOnce();
		expect(runtime.value?.state.state.value.late).toMatchObject({ value: 'Austen' });
		expect(sync.initialReadSettled.value).toBe(true);
	});

	test('restores the editable form on each navigation after a failed customization hook', async () => {
		const error = new Error('customization failed');
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { runtime, router } = await setup(`${path}/docs?f.form=search.simple&f.late=Austen`, {
			beforeStateLoaded: async runtime => {
				runtime.value = form({ withField: true });
				throw error;
			},
		});
		await flushPromises();
		expect(runtime.value?.state.state.value.late).toMatchObject({ value: 'Austen' });
		await router.push(`${path}/docs?f.form=search.simple&f.late=Woolf`);
		await flushPromises();
		expect(runtime.value?.state.state.value.late).toMatchObject({ value: 'Woolf' });
		expect(log).toHaveBeenCalledWith('beforeStateLoaded hook failed', error);
	});

	test('waits for the incoming search form to finish restoring before the initial page is ready', async () => {
		const gate = deferred();
		const { router, activeSearchParameters, sync, restoring } = await setup(`${path}/hits?patt=${encodeURIComponent(pattern)}&sample=25`, { beforeStateLoaded: () => gate.promise });

		await vi.waitFor(() => expect(router.currentRoute.value.query.sampleseed).toBeDefined());

		expect(sync.initialReadSettled.value).toBe(false);
		expect(restoring.value).toBe(true);
		gate.resolve();
		await restored(activeSearchParameters);
		expect(sync.initialReadSettled.value).toBe(true);
		expect(restoring.value).toBe(false);
	});

	test.each(['sample=25', 'samplenum=8'])('shares a generated sampling seed across requests, controls, and pagination for %s', async sampling => {
		const { router, activeSearchParameters, sync } = await setup(`${path}/hits?patt=${encodeURIComponent(pattern)}&${sampling}`);
		await restored(activeSearchParameters);
		const seed = activeSearchParameters.value?.sampleseed;
		expect(Number.isSafeInteger(seed)).toBe(true);
		expect(sync.initialReadSettled.value).toBe(true);
		expect(router.currentRoute.value.query.sampleseed).toBe(String(seed));
		expect(results.settings.sampleSeed).toBe(seed);
		await sync.run(() => (results.view('hits').state.first = 20));
		expect(activeSearchParameters.value).toMatchObject({ first: 20, sampleseed: seed });
		expect(router.currentRoute.value.query.sampleseed).toBe(String(seed));
	});

	test('one submit publishes its completed query and result settings; Back and Forward restore each URL', async () => {
		const { sync, router, searchForm, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		const original = window.location.href;
		const length = window.history.length;
		await sync.run(() => searchForm.submit(submittedQuery('[word="ship"]')));
		const submitted = window.location.href;
		expect(new URL(submitted).searchParams.get('patt')).toBe('[word="ship"]');
		expect(window.history.length).toBe(length + 1);
		await sync.run(() => {
			const view = results.view('hits');
			view.setGroupBy(['hit:word']);
			view.setRange({ first: 40, number: 20 });
			view.state.sort = '-size';
		});
		const grouped = window.location.href;
		expect(new URL(grouped).searchParams.get('first')).toBe('40');
		expect(new URL(grouped).searchParams.get('group')).toBe('hit:word');
		expect(window.history.length).toBe(length + 2);
		router.back();
		await vi.waitFor(() => expect(window.location.href).toBe(submitted));
		await vi.waitFor(() => expect(results.view('hits').state.groupBy).toEqual([]));
		router.back();
		await vi.waitFor(() => expect(window.location.href).toBe(original));
		await restored(activeSearchParameters);
		router.forward();
		await restored(activeSearchParameters, '[word="ship"]');
		expect(window.location.href).toBe(submitted);
		router.forward();
		await vi.waitFor(() => expect(results.view('hits').state.first).toBe(40));
		expect(window.location.href).toBe(grouped);
		expect(window.history.length).toBe(length + 2);
	});

	test('incoming navigation supersedes a pending result change without saving it to history', async () => {
		const { router, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		const entered = deferred();
		const release = deferred();
		router.beforeEach(to => {
			if (to.query.sort === '-size') {
				entered.resolve();
				return release.promise;
			}
		});
		results.view('hits').state.sort = '-size';
		await entered.promise;
		try {
			await router.push(`${path}/docs?filter=author%3AAusten`);
		} finally {
			release.resolve();
		}
		await flushPromises();
		expect(router.currentRoute.value.query).toEqual({ filter: 'author:Austen' });
		expect(activeSearchParameters.value?.filter).toBe('author:Austen');
		expect(HistoryStore.getState()).toEqual([]);
	});

	test('a replacement form restores only the current URL after a pending hook', async () => {
		const pending = deferred();
		const { runtime, router, activeSearchParameters, restoring } = await setup(undefined, { beforeStateLoaded: () => pending.promise });
		expect(restoring.value).toBe(true);
		await router.push(`${path}/hits?patt=${encodeURIComponent('[word="new definition"]')}&f.form=search.simple&f.late=author`);
		runtime.value = form({ withField: true });
		pending.resolve();
		await restored(activeSearchParameters, '[word="new definition"]');
		expect(restoring.value).toBe(false);
		expect(runtime.value.state.state.value.late).toEqual({ value: 'author', caseSensitive: false });
	});

	test('replacing a form discards its draft without submitting or changing collocation controls', async () => {
		const { runtime, sync, searchForm, activeSearchParameters } = await setup(path);
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
			searchForm.submit({ ...submittedQuery(), params });
			results.setSampleSeed(123);
			results.setSampleSize(25);
			const view = results.view('hits');
			view.setCollocationScorer('coll-salience');
			view.setViewGroup('word:ship');
			view.state.sort = '-size';
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

	test('keeps independent ordinary and custom ranges across resize and view switches', async () => {
		const { sync, router, activeSearchParameters } = await setup(`${path}/hits?patt=[word=%22water%22]&first=40&number=20`);
		await restored(activeSearchParameters);
		const hits = results.view('hits');
		const docs = results.view('docs');
		const url = router.currentRoute.value.fullPath;
		await sync.run(() => docs.setRange({ first: 45, number: 30 }));
		expect(router.currentRoute.value.fullPath).toBe(url);
		await sync.run(() => results.setPageSize(50));
		expect(hits.selectedRange).toEqual({ first: 0, number: 50 });
		expect(docs.selectedRange).toEqual({ first: 45, number: 30 });
		await sync.run(() => void results.selectView('docs'));
		expect(activeSearchParameters.value).toMatchObject({ first: 0, number: 100 });
		await sync.run(() => void results.selectView('hits'));
		expect(activeSearchParameters.value).toMatchObject({ first: 0, number: 50 });
		expect(docs.selectedRange).toEqual({ first: 45, number: 30 });
	});

	test('submitting a new query resets every view to the preferred first page', async () => {
		const { sync, searchForm, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		results.view('hits').setRange({ first: 40, number: 20 });
		results.view('docs').setRange({ first: 45, number: 30 });
		results.setPageSize(50);
		await sync.run(() => searchForm.submit(submittedQuery('[word="new"]')));
		expect(activeSearchParameters.value).toMatchObject({ patt: '[word="new"]', first: 0, number: 50 });
		for (const name of ['hits', 'docs']) expect(results.view(name).selectedRange).toEqual({ first: 0, number: 50 });
	});

	test('submitting a documents query removes legacy pattern aliases from the URL', async () => {
		const incoming = `${path}/hits?query=${encodeURIComponent(pattern)}&field=contents&pattgapdata=water&interface=%7B%22form%22%3A%22search%22%7D&extension=shared#results`;
		const { sync, router, searchForm, activeSearchParameters } = await setup(incoming);
		const browserEntries = window.history.length;
		await restored(activeSearchParameters);
		expect(activeSearchParameters.value?.pattgapdata).toBe('water');
		expect(router.currentRoute.value.fullPath).toBe(incoming);
		expect(window.history.length).toBe(browserEntries);
		await sync.run(() => (results.view('hits').state.first = 20));
		expect(router.currentRoute.value.query).toMatchObject({ patt: pattern, pattgapdata: 'water', interface: '{"form":"search"}' });
		await sync.run(() => searchForm.submit({ ...submittedQuery(), params: {} }));
		expect(router.currentRoute.value.query).not.toHaveProperty('query');
		expect(router.currentRoute.value.query).not.toHaveProperty('field');
		expect(router.currentRoute.value.query).not.toHaveProperty('interface');
		expect(router.currentRoute.value.query.extension).toBe('shared');
		expect(router.currentRoute.value.hash).toBe('#results');

		expect(activeSearchParameters.value?.patt).toBeUndefined();
	});

	test('opening a saved search resets inactive result controls to their defaults', async () => {
		const { router, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		const hits = results.view('hits');
		hits.setGroupBy(['hit:word']);
		hits.state.sort = '-size';
		hits.setRange({ first: 45, number: 30 });
		results.setPageSize(50);
		await nextTick();
		await router.push(`${path}/docs?patt=${encodeURIComponent(pattern)}&first=105&number=10&sort=field:title`);
		await flushPromises();
		expect(results.selectedViewName).toBe('docs');
		expect(hits.state).toMatchObject({ first: 0, number: 50, groupBy: [], sort: null, viewGroup: null });
		expect(results.view('docs').state).toMatchObject({ first: 105, number: 10, sort: 'field:title' });
		expect(activeSearchParameters.value).toMatchObject({ first: 100, number: 50 });
	});
	test.each(['hits', 'docs'])('opening a %s URL hydrates only that view and expands its selection', async view => {
		for (const name of ['hits', 'docs']) {
			results.view(name).setRange({ first: 200, number: 20 });
			results.view(name).state.sort = '-size';
		}
		const { router, activeSearchParameters } = await setup(`${path}/${view}?patt=${encodeURIComponent(pattern)}&first=45&number=30`);
		await restored(activeSearchParameters);
		expect(results.selectedViewName).toBe(view);
		expect(results.view(view).selectedRange).toEqual({ first: 45, number: 30 });
		expect(results.view(view === 'hits' ? 'docs' : 'hits').state).toMatchObject({ first: 0, number: 20, sort: null });
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
		await sync.run(() => (results.view('hits').state.sort = 'hit:word'));
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
		await sync.run(() => results.view('hits').setRange({ first: 80, number: 20 }));
		pending.resolve();
		await restored(activeSearchParameters);
		expect(activeSearchParameters.value).toMatchObject({ patt: pattern, filter, first: 80, number: 20, group: 'hit:word', sort: '-size' });
		expect(router.currentRoute.value.query).toMatchObject({ patt: pattern, filter, first: '80', number: '20' });
	});

	test('reset clears the submitted search and URL', async () => {
		const { sync, router, searchForm, activeSearchParameters } = await setup();
		await restored(activeSearchParameters);
		await sync.run(() => searchForm.reset());
		expect(activeSearchParameters.value).toBeUndefined();
		expect(results.selectedViewName).toBeNull();
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
