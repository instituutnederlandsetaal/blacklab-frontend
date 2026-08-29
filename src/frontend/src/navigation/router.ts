import { computed, toValue, type FunctionPlugin, type MaybeRefOrGetter } from 'vue';
import { createRouter, createWebHistory, useRoute, useRouter, type LocationQueryRaw, type RouteLocationNormalizedLoaded, type Router } from 'vue-router';

import type { PageBootstrap } from '@/navigation/page-bootstrap';
import { provideCorpusId, useCorpusId, type PageMeta } from '@/navigation/page-context';

type RouteQueryPatch = Record<string, string | number | boolean | null | undefined>;

function getRouteParamString(value: unknown): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function getStringFromRouteQuery(route: RouteLocationNormalizedLoaded, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = getRouteParamString(route.query[key]);
		if (value) return value;
	}
	return null;
}

function getNumberFromRouteQuery(route: RouteLocationNormalizedLoaded, key: string): number | null {
	const value = getStringFromRouteQuery(route, key);
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function getAnnotatedFieldFromRouteQuery(route: RouteLocationNormalizedLoaded, fields: Record<string, unknown>, ...keys: string[]): string | null {
	const value = getStringFromRouteQuery(route, ...keys);
	return value && fields[value] ? value : null;
}

function updateRouteQuery(router: Router, route: RouteLocationNormalizedLoaded, patch: RouteQueryPatch) {
	const query: LocationQueryRaw = { ...route.query };
	for (const [key, value] of Object.entries(patch)) {
		if (value == null) delete query[key];
		else query[key] = String(value);
	}
	return router.push({ name: route.name ?? undefined, params: route.params, query });
}

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
