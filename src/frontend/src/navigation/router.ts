import { computed, type FunctionPlugin } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import type { PageBootstrap } from '@/navigation/page-bootstrap';
import { provideCorpusId, useCorpusId, type PageMeta } from '@/navigation/page-context';

import CorpusPage from '@/pages/corpus/CorpusPage.vue';

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
				component: () => import('@/pages/info').then(pages => pages.HelpPage),
			},
			{
				name: 'global-about',
				path: '/about',
				meta: { name: 'about', getTitle: () => 'About', customScriptTiming: 'after-page-bootstrap' },
				component: () => import('@/pages/info').then(pages => pages.AboutPage),
			},
			{
				path: '/configwizard',
				meta: { name: 'configwizard' },
				component: () => import('@/pages/config/entrypoint').then(pages => pages.ConfigPage),
				children: [
					{
						name: 'global-configwizard',
						path: '',
						component: () => import('@/pages/config/entrypoint').then(pages => pages.CorpusPicker),
					},
				],
			},
			{
				name: 'corpus',
				path: '/:corpus',
				redirect: r => ({ name: 'search', params: { corpus: r.params.corpus } }),
				component: CorpusPage,
				children: [
					{
						name: 'search',
						path: 'search/:results?',
						meta: { name: 'search', getTitle: (displayName: string) => `${displayName} Search`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/features/search/entrypoint').then(feature => feature.SearchPage),
					},
					{
						name: 'article',
						path: 'docs/:docId',
						meta: { name: 'article', getTitle: (displayName: string) => `${displayName} Article`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/features/article/entrypoint').then(feature => feature.ArticlePage),
					},
					{
						name: 'about',
						path: 'about',
						meta: { name: 'about', getTitle: (displayName: string) => `About ${displayName}`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/pages/info').then(pages => pages.AboutPage),
					},
					{
						name: 'help',
						path: 'help',
						meta: { name: 'help', getTitle: (displayName: string) => `${displayName} Help`, customScriptTiming: 'after-page-bootstrap' },
						component: () => import('@/pages/info').then(pages => pages.HelpPage),
					},

					{
						name: 'configwizard',
						path: 'configwizard',
						meta: { name: 'configwizard' },
						component: () => import('@/pages/config/entrypoint').then(pages => pages.CorpusConfig),
						redirect: to => ({ name: 'tagset builder', params: { corpus: to.params.corpus } }),
						children: [
							{
								path: 'pos',
								name: 'tagset builder',
								component: () => import('@/pages/config/entrypoint').then(pages => pages.POS),
							},
							{
								path: 'interface',
								name: 'interface',
								component: () => import('@/pages/config/entrypoint').then(pages => pages.Interface),
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
