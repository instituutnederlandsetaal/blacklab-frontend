import { computed, type FunctionPlugin } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import type { PageBootstrap } from '@/navigation/page-bootstrap';
import { provideCorpusId, useCorpusId, type PageMeta } from '@/navigation/page-context';

function getRouteParamString(value: unknown): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

// make sure we always have a route meta object
declare module 'vue-router' {
	interface RouteMeta extends PageMeta {}
}

function createBlfRouter(pageBootstrap: PageBootstrap) {
	const router = createRouter({
		history: createWebHistory(CONTEXT_URL),
		routes: [
			{
				name: 'corpora',
				path: '/',
				meta: { name: 'corpora', getTitle: () => 'Corpora' },
				component: () => import('@/pages/corpora/CorporaPage.vue'),
			},
			{
				name: 'global-help',
				path: '/help',
				meta: { name: 'help', getTitle: (displayName: string) => displayName + ' Help', customScriptTiming: 'after-page-bootstrap' },
				component: () => import('@/pages/help/HelpPage.vue'),
			},
			{
				name: 'global-about',
				path: '/about',
				meta: { name: 'about', getTitle: () => 'About', customScriptTiming: 'after-page-bootstrap' },
				component: () => import('@/pages/about/AboutPage.vue'),
			},
			{
				path: '/configwizard',
				meta: { name: 'configwizard' },
				component: () => import('@/pages/config/ConfigPage.vue'),
				children: [
					{
						name: 'global-configwizard',
						path: '',
						component: () => import('@/pages/config/CorpusPicker.vue'),
					},
				],
			},
			{
				name: 'corpus',
				path: '/:corpus',
				redirect: r => ({ name: 'search', params: { corpus: r.params.corpus } }),
				component: () => import('@/pages/corpus/CorpusPage.vue'),
				children: [
					{
						name: 'search',
						path: 'search/:results?',
						meta: { name: 'search', getTitle: (displayName: string) => `${displayName} Search`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/pages/search/SearchPage.vue'),
					},
					{
						name: 'article',
						path: 'docs/:docId',
						meta: { name: 'article', getTitle: (displayName: string) => `${displayName} Article`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/pages/article/ArticlePage.vue'),
					},
					{
						name: 'about',
						path: 'about',
						meta: { name: 'about', getTitle: (displayName: string) => `About ${displayName}`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/pages/about/AboutPage.vue'),
					},
					{
						name: 'help',
						path: 'help',
						meta: { name: 'help', getTitle: (displayName: string) => `${displayName} Help`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/pages/help/HelpPage.vue'),
					},

					{
						name: 'configwizard',
						path: 'configwizard',
						meta: { name: 'configwizard' },
						component: () => import('@/pages/config/CorpusConfig.vue'),
						redirect: to => ({ name: 'tagset builder', params: { corpus: to.params.corpus } }),
						children: [
							{
								path: 'pos',
								name: 'tagset builder',
								component: () => import('@/pages/config/POS.vue'),
							},
							{
								path: 'interface',
								name: 'interface',
								component: () => import('@/pages/config/Interface.vue'),
							},
						],
					},
				],
			},
		],
	});

	router.beforeResolve((to, from) => {
		pageBootstrap.changePage(to.meta, to.name === from.name && getRouteParamString(to.params.corpus) === getRouteParamString(from.params.corpus));
	});

	const corpusId = computed(() => router.currentRoute.value.params.corpus as string | undefined);
	return {
		router,
		corpusId,

		install: (app => {
			app.use(router);
			provideCorpusId(app, corpusId);
		}) satisfies FunctionPlugin,
	};
}

export { useCorpusId, createBlfRouter };
