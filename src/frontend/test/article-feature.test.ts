// @vitest-environment jsdom

import { flushPromises } from '@vue/test-utils';
import { expect, test } from 'vitest';
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { createArticleFeature } from '@/features/article/article-feature';
import { useArticleState, type ArticleState } from '@/features/article/model/article-page-state';
import type { Corpus } from '@/types/apptypes';

test('installs article state during navigation and disposes URL synchronization with the app', async () => {
	let state: ArticleState | undefined;
	const article = defineComponent({
		setup() {
			const articleState = useArticleState();
			state = articleState;
			return () => h('p', `${articleState.parameters.value.docId}:${articleState.parameters.value.findhit}`);
		},
	});
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ name: 'home', path: '/', component: { render: () => h('p', 'Home') } },
			{ name: 'article', path: '/:corpus/docs/:docId', component: article },
		],
	});
	const corpus = shallowRef({ id: 'test', allAnnotatedFieldsMap: { contents: {} }, mainAnnotatedField: 'contents' } as unknown as Corpus);
	const app = createApp({ render: () => h(RouterView) });
	const element = document.createElement('div');
	let installed = false;
	router.beforeResolve(to => {
		if (to.name !== 'article' || installed) return;
		app.use(createArticleFeature({ corpus, router }));
		installed = true;
	});
	await router.push('/');
	app.use(router);
	app.mount(element);
	try {
		await router.push('/test/docs/doc-1?findhit=12');
		await nextTick();
		expect(element.textContent).toBe('doc-1:12');
		state!.showPage(2, 10);
		await flushPromises();
		expect(router.currentRoute.value.query).toMatchObject({ wordstart: '20', wordend: '30' });
		await router.push('/test/docs/doc-2?findhit=4');
		await nextTick();
		expect(element.textContent).toBe('doc-2:4');
	} finally {
		app.unmount();
	}
	await router.push('/test/docs/doc-3?findhit=5');
	await nextTick();
	// A disposed feature no longer reads browser navigation into the retained state.
	state!.showHit(6);
	await flushPromises();
	const docId = state!.parameters.value.docId;
	expect(docId).toBe('doc-2');
	expect(router.currentRoute.value.fullPath).toBe('/test/docs/doc-3?findhit=5');
});
