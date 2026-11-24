// @vitest-environment jsdom

import { flushPromises } from '@vue/test-utils';
import { expect, test } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { createArticlePlugin } from '@/pages/article/article-plugin';
import { useArticlePageState } from '@/pages/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';

test('installs article state during navigation and disposes URL synchronization with the app', async () => {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ name: 'home', path: '/', component: {} },
			{ name: 'article', path: '/:corpus/docs/:docId', component: {} },
		],
	});
	const corpus = { id: 'test', allAnnotatedFieldsMap: { contents: { id: 'contents' } }, mainAnnotatedField: 'contents' } as unknown as Corpus;
	const app = createApp(() => null);
	const element = document.createElement('div');
	const stopGuard = router.beforeResolve(to => {
		if (to.name !== 'article') return;
		stopGuard();
		app.use(createArticlePlugin({ corpus, router }));
	});
	await router.push('/');
	app.mount(element);
	await router.push('/test/docs/doc-1?findhit=12');
	const state = app.runWithContext(useArticlePageState);
	try {
		await nextTick();
		expect(state.query.value).toMatchObject({ docId: 'doc-1', findhit: 12 });
		state.showPage(2, 10);
		await flushPromises();
		expect(router.currentRoute.value.query).toMatchObject({ wordstart: '20', wordend: '30' });
		await router.push('/test/docs/doc-2?findhit=4');
		await nextTick();
		expect(state.query.value).toMatchObject({ docId: 'doc-2', findhit: 4 });
	} finally {
		app.unmount();
	}
	await router.push('/test/docs/doc-3?findhit=5');
	await nextTick();
	// A disposed feature no longer reads browser navigation into the retained state.
	state.showHit(6);
	await flushPromises();
	const docId = state.query.value.docId;
	expect(docId).toBe('doc-2');
	expect(router.currentRoute.value.fullPath).toBe('/test/docs/doc-3?findhit=5');
});
