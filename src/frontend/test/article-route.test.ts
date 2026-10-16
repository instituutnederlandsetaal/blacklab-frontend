import { flushPromises } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { createArticlePageState } from '@/features/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';
import { createArticleUrlBinding } from '@/url/article-state';

const annotatedFields = { contents: { id: 'contents' }, translation: { id: 'translation' } };

async function setup(query: Record<string, string | string[]> = {}) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ name: 'article', path: '/:corpus/docs/:docId', component: {} }],
	});
	await router.push({ name: 'article', params: { corpus: 'test', docId: 'doc-1' }, query });
	const corpus = { id: 'test', allAnnotatedFieldsMap: annotatedFields, mainAnnotatedField: 'contents' } as unknown as Corpus;
	const state = createArticlePageState(corpus);
	const binding = createArticleUrlBinding(router, state, corpus);
	await flushPromises();
	return { router, state, stop: binding.stop };
}

describe('article URLs', () => {
	test('removes redundant default fields on arrival and keeps them out of subsequent page URLs', async () => {
		const { router, state, stop } = await setup({ field: 'contents', searchfield: 'contents', patt: '[]' });
		expect(router.currentRoute.value.query).toEqual({ patt: '[]' });
		expect(state.parameters.value).toMatchObject({ viewField: 'contents', searchfield: 'contents' });
		state.showPage(1, 10);
		await flushPromises();
		expect(router.currentRoute.value.query).toEqual({ patt: '[]', wordstart: '10', wordend: '20' });
		stop();
	});

	test('resolves parallel version aliases and keeps distinct source and view fields', async () => {
		const corpus = {
			id: 'test',
			isParallelCorpus: true,
			mainAnnotatedField: 'contents__nl',
			allAnnotatedFieldsMap: { contents__nl: { id: 'contents__nl' }, contents__en: { id: 'contents__en' } },
		} as unknown as Corpus;
		const state = createArticlePageState(corpus);
		const router = createRouter({ history: createMemoryHistory(), routes: [{ name: 'article', path: '/:corpus/docs/:docId', component: {} }] });
		await router.push('/test/docs/doc?field=en&searchfield=nl&patt=query');
		const binding = createArticleUrlBinding(router, state, corpus);
		await flushPromises();
		expect(state.parameters.value).toMatchObject({ viewField: 'contents__en', searchfield: 'contents__nl' });
		expect(router.currentRoute.value.query).toEqual({ field: 'contents__en', searchfield: 'contents__nl', patt: 'query' });
		binding.stop();
		const ambiguous = createArticlePageState({
			...corpus,
			allAnnotatedFieldsMap: { ...corpus.allAnnotatedFieldsMap, translation__en: { ...corpus.allAnnotatedFieldsMap.contents__en, id: 'translation__en' } },
		});
		ambiguous.restore({ ...state.query.value, viewField: 'en', searchfield: null });
		expect(ambiguous.parameters.value.viewField).toBe('contents__nl');
		ambiguous.restore({ ...state.query.value, viewField: 'translation__en', searchfield: null });
		expect(ambiguous.parameters.value.viewField).toBe('translation__en');
	});
	test.each([
		['searchfield', { searchfield: 'translation' }],
		['searchField', { searchField: 'translation' }],
		['field', { field: 'translation' }],
	] as const)('accepts the %s search-field alias', async (_name, query) => {
		const { state, stop } = await setup(query);
		expect(state.parameters.value.searchfield).toBe('translation');
		stop();
	});

	test('accepts the legacy pattern alias and prefers the canonical pattern', async () => {
		const { router, state, stop } = await setup({ query: 'legacy' });
		expect(state.parameters.value.patt).toBe('legacy');
		await router.push({ query: { patt: 'canonical', query: 'legacy' } });
		expect(state.parameters.value.patt).toBe('canonical');
		stop();
	});

	test('paging clears the selected hit and publishes the requested word range', async () => {
		const { router, state, stop } = await setup({ field: 'contents', findhit: '12', patt: 'query', wordstart: '10' });
		state.showPage(2, 10);
		expect(state.parameters.value).toMatchObject({ wordstart: 20, wordend: 30, findhit: null });
		await flushPromises();
		expect(router.currentRoute.value.query).toEqual({ patt: 'query', wordstart: '20', wordend: '30' });
		stop();
	});

	test('imports browser history and an external document navigation', async () => {
		const { router, state, stop } = await setup({ wordstart: '10', wordend: '20' });
		state.showHit(27);
		await flushPromises();
		expect(state.parameters.value).toMatchObject({ findhit: 27, wordstart: null, wordend: null });
		const back = new Promise<void>(resolve => {
			const stop = router.afterEach(() => {
				stop();
				resolve();
			});
		});
		router.back();
		await back;
		expect(state.parameters.value).toMatchObject({ findhit: null, wordstart: 10, wordend: 20 });
		await router.push('/test/docs/doc-2?findhit=4');
		expect(state.parameters.value).toMatchObject({ docId: 'doc-2', findhit: 4, wordstart: null });
		stop();
	});

	test('restores an article when its corpus loads and stops publishing after leaving it', async () => {
		const corpus = shallowRef<Corpus>();
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ name: 'article', path: '/:corpus/docs/:docId', component: {} },
				{ name: 'search', path: '/:corpus/search', component: {} },
			],
		});
		await router.push('/test/docs/doc-1?findhit=12');
		const state = createArticlePageState(corpus);
		const binding = createArticleUrlBinding(router, state, corpus);
		expect(state.parameters.value.docId).toBeNull();
		corpus.value = { id: 'test', allAnnotatedFieldsMap: annotatedFields, mainAnnotatedField: 'contents' } as unknown as Corpus;
		await nextTick();
		expect(state.parameters.value).toMatchObject({ docId: 'doc-1', findhit: 12 });
		state.showPage(2, 10);
		await flushPromises();
		expect(router.currentRoute.value.query).toMatchObject({ wordstart: '20', wordend: '30' });
		await router.push('/test/search');
		expect(state.parameters.value.docId).toBeNull();
		state.showHit(42);
		await flushPromises();
		expect(router.currentRoute.value.fullPath).toBe('/test/search');
		binding.stop();
	});
});
