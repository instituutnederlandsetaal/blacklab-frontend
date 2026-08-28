import { computed, toValue, type FunctionPlugin, type MaybeRefOrGetter } from 'vue';
import { createRouter, createWebHistory, useRoute, useRouter } from 'vue-router';

import type { PageBootstrap } from '@/navigation/page-bootstrap';
import { provideCorpusId, useCorpusId, type PageMeta } from '@/navigation/page-context';
import { getAnnotatedFieldFromRouteQuery, getNumberFromRouteQuery, getRouteParamString, getStringFromRouteQuery, updateRouteQuery, type RouteQueryPatch } from '@/url/route-query';

// make sure we always have a route meta object
declare module 'vue-router' {
	interface RouteMeta extends PageMeta {}
}

function useArticleRoute(annotatedFields: MaybeRefOrGetter<Record<string, unknown>>, defaultField: MaybeRefOrGetter<string>) {
	const route = useRoute();
	const router = useRouter();
	const articleRoute = computed(() => ({
		docId: getRouteParamString(route.params.docId),
		viewField: getAnnotatedFieldFromRouteQuery(route, toValue(annotatedFields), 'field') ?? toValue(defaultField),
		// searchfield is canonical; searchField and field remain as backward-compatible aliases.
		searchfield: getAnnotatedFieldFromRouteQuery(route, toValue(annotatedFields), 'searchfield', 'searchField', 'field') ?? toValue(defaultField),
		wordstart: getNumberFromRouteQuery(route, 'wordstart'),
		wordend: getNumberFromRouteQuery(route, 'wordend'),
		findhit: getNumberFromRouteQuery(route, 'findhit'),
		patt: getStringFromRouteQuery(route, 'patt', 'query'),
		pattgapdata: getStringFromRouteQuery(route, 'pattgapdata'),
	}));
	return {
		articleRoute,
		updateArticleQuery: (patch: RouteQueryPatch) => updateRouteQuery(router, route, patch),
	};
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
				name: 'global-configwizard',
				path: '/configwizard',
				meta: { name: 'configwizard' },
				component: () => import('@/pages/config/ConfigPage.vue'),
				// todo make this make sense.
				children: [
					{
						path: '/:pathMatch(.*)*',
						component: () => import('@/pages/config/CorpusPicker.vue'),
					},
				],
			},
			{
				name: 'corpus',
				path: '/:corpus',
				redirect: '/:corpus/search',
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
						props: route => ({
							id: route.params.id,
							activeTab: route.params.tab,
							tabs: ['tagset builder', 'interface'],
						}),
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

	router.beforeResolve((to, _from, next) => {
		pageBootstrap.changePage(to.meta);
		next();
	});

	const corpusId = computed(() => router.currentRoute.value.params.corpus as string | undefined);
	const pageMeta = computed(() => (router.currentRoute.value.meta as PageMeta) || null);
	return {
		router,
		corpusId,
		pageMeta,

		install: (app => {
			router.install(app);
			provideCorpusId(app, corpusId);
		}) satisfies FunctionPlugin,
	};
}

export { useArticleRoute, useCorpusId, createBlfRouter };
