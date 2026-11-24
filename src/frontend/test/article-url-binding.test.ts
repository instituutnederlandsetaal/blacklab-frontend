import { flushPromises } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, shallowRef } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { createArticleUrlBinding } from '@/pages/article/bindings/article-url-binding';
import { createArticlePageState } from '@/pages/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';

const annotatedFields = { contents: { id: 'contents' }, translation: { id: 'translation' } };

const defaultCorpus = { id: 'test', allAnnotatedFieldsMap: annotatedFields, mainAnnotatedField: 'contents' } as unknown as Corpus;

async function setup(query: Record<string, string | string[]> = {}, corpus = defaultCorpus) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ name: 'article', path: '/:corpus/docs/:docId', component: {} }],
	});
	await router.push({ name: 'article', params: { corpus: 'test', docId: 'doc-1' }, query });
	const state = createArticlePageState();
	const binding = createArticleUrlBinding(router, state, corpus);
	await flushPromises();
	return { router, state, stop: binding.stop };
}

describe('article URLs', () => {
	test('opening an article link restores the hit and preserves extension parameters and hash while paging', async () => {
		const { router, state, stop } = await setup();
		await router.push('/test/docs/doc%2F2?field=translation&searchfield=contents&patt=[]&pattgapdata=two+words&findhit=0&flag&ext=one&ext=two#text');
		await flushPromises();
		expect(state.query.value).toMatchObject({ docId: 'doc/2', field: 'translation', searchfield: 'contents', patt: '[]', pattgapdata: 'two words', findhit: 0 });
		state.showPage(1, 10);
		await flushPromises();
		expect(router.currentRoute.value).toMatchObject({
			hash: '#text',
			query: { field: 'translation', searchfield: 'contents', patt: '[]', pattgapdata: 'two words', wordstart: '10', wordend: '20', flag: null, ext: ['one', 'two'] },
		});
		stop();
	});

	test('removes redundant default fields on arrival and keeps them out of subsequent page URLs', async () => {
		const { router, state, stop } = await setup({ field: 'contents', searchfield: 'contents', patt: '[]' });
		expect(router.currentRoute.value.query).toEqual({ patt: '[]' });
		expect(state.query.value).toMatchObject({ field: undefined, searchfield: undefined });
		state.showPage(1, 10);
		await flushPromises();
		expect(router.currentRoute.value.query).toEqual({ patt: '[]', wordstart: '10', wordend: '20' });
		stop();
	});

	test('resolves parallel version aliases and keeps distinct source and view fields', async () => {
		const fields = ['contents__nl', 'contents__en', 'contents__de', 'translation__de'];
		const corpus = { ...defaultCorpus, mainAnnotatedField: 'contents__nl', allAnnotatedFieldsMap: Object.fromEntries(fields.map(id => [id, { ...defaultCorpus.allAnnotatedFieldsMap.contents, id }])) };
		const { router, state, stop } = await setup({ field: 'en', searchfield: 'nl', patt: 'query' }, corpus);
		expect(state.query.value).toMatchObject({ field: 'contents__en', searchfield: 'contents__nl' });
		expect(router.currentRoute.value.query).toEqual({ field: 'contents__en', searchfield: 'contents__nl', patt: 'query' });
		await router.push({ query: { field: 'de' } });
		await flushPromises();
		expect(state.query.value.field).toBe('contents__de');
		await router.push({ query: { field: 'translation__de' } });
		expect(state.query.value.field).toBe('translation__de');
		stop();
	});
	test.each([
		['searchfield', { searchfield: 'translation' }],
		['searchField', { searchField: 'translation' }],
	] as const)('accepts the %s search-field alias', async (_name, query) => {
		const { state, stop } = await setup({ ...query, patt: '[]' });
		expect(state.query.value.searchfield).toBe('translation');
		stop();
	});

	test('accepts the legacy pattern alias and prefers the canonical pattern', async () => {
		const { router, state, stop } = await setup({ query: 'legacy' });
		expect(state.query.value.patt).toBe('legacy');
		await router.push({ query: { patt: 'canonical', query: 'legacy' } });
		expect(state.query.value.patt).toBe('canonical');
		stop();
	});

	test('paging clears the selected hit and publishes the requested word range', async () => {
		const { router, state, stop } = await setup({ field: 'contents', findhit: '12', patt: 'query', wordstart: '10' });
		state.showPage(2, 10);
		expect(state.query.value).toMatchObject({ wordstart: 20, wordend: 30, findhit: null });
		await flushPromises();
		expect(router.currentRoute.value.query).toEqual({ patt: 'query', wordstart: '20', wordend: '30' });
		stop();
	});

	test('imports browser history and an external document navigation', async () => {
		const { router, state, stop } = await setup({ wordstart: '10', wordend: '20' });
		state.showHit(27);
		await flushPromises();
		expect(state.query.value).toMatchObject({ findhit: 27, wordstart: null, wordend: null });
		const back = new Promise<void>(resolve => {
			const stop = router.afterEach(() => {
				stop();
				resolve();
			});
		});
		router.back();
		await back;
		expect(state.query.value).toMatchObject({ findhit: null, wordstart: 10, wordend: 20 });
		await router.push('/test/docs/doc-2?findhit=4');
		expect(state.query.value).toMatchObject({ docId: 'doc-2', findhit: 4, wordstart: null });
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
		const state = createArticlePageState();
		const binding = createArticleUrlBinding(router, state, corpus);
		expect(state.query.value.docId).toBeNull();
		corpus.value = defaultCorpus;
		await nextTick();
		expect(state.query.value).toMatchObject({ docId: 'doc-1', findhit: 12 });
		state.showPage(2, 10);
		await flushPromises();
		expect(router.currentRoute.value.query).toMatchObject({ wordstart: '20', wordend: '30' });
		await router.push('/test/search');
		expect(state.query.value.docId).toBeNull();
		state.showHit(42);
		await flushPromises();
		expect(router.currentRoute.value.fullPath).toBe('/test/search');
		binding.stop();
	});
});
