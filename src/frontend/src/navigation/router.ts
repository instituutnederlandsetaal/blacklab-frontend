import { computed, type FunctionPlugin, type Ref } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import { resetPageBootstrapForRoute, type CustomScriptTiming } from '@/navigation/page-bootstrap';

import useInjectable from '@/shared/utils/useInjectable';

/**
 * We need some metadata about the current route in order for customJs and customCss to work correctly.
 * Store it in a standardized object so we can be sure it's available as expected.
 */
type CustomRouteMeta = {
	name: string;
	getTitle?: (corpusDisplayName: string) => string;
	customScriptTiming?: CustomScriptTiming;
};

const [_corpusIdKey, provideCorpusId, useCorpusId] = useInjectable<Ref<string | undefined>>('corpus_id');
const [_articleIdKey, provideArticleId, useArticleId] = useInjectable<Ref<string | undefined>>('article_id');
const [_routeMetaKey, provideRouteMeta, useRouteMeta] = useInjectable<Ref<CustomRouteMeta | null>>('route_meta');

function createBlfRouter() {
	const router = createRouter({
		history: createWebHistory(CONTEXT_URL),
		routes: [
			{
				name: 'corpora',
				path: '/',
				meta: { name: 'corpora', getTitle: () => 'Corpora' } satisfies CustomRouteMeta,
				component: () => import('@/pages/corpora/CorporaPage.vue'),
			},
			{
				name: 'global-help',
				path: '/help',
				alias: '/help/:pathMatch(.*)*',
				meta: { name: 'help', getTitle: (displayName: string) => displayName + ' Help', customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
				component: () => import('@/pages/help/HelpPage.vue'),
			},
			{
				name: 'global-about',
				path: '/about',
				alias: '/about/:pathMatch(.*)*',
				meta: { name: 'about', getTitle: () => 'About', customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
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
						path: 'search',
						alias: 'search/:pathMatch(.*)*',
						meta: { name: 'search', getTitle: (displayName: string) => `${displayName} Search` } satisfies CustomRouteMeta,
						component: () => import('@/pages/search/SearchPage.vue'),
					},
					{
						name: 'article',
						path: 'docs/:docId',
						meta: { name: 'article', getTitle: (displayName: string) => `${displayName} Article`, customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
						component: () => import('@/pages/article/ArticlePage.vue'),
					},
					{
						name: 'about',
						path: 'about',
						meta: { name: 'about', getTitle: (displayName: string) => `About ${displayName}`, customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
						component: () => import('@/pages/about/AboutPage.vue'),
					},
					{
						name: 'help',
						path: 'help',
						meta: { name: 'help', getTitle: (displayName: string) => `${displayName} Help`, customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
						component: () => import('@/pages/help/HelpPage.vue'),
					},

					{
						name: 'configwizard',
						path: 'configwizard',
						meta: { name: 'configwizard' } satisfies CustomRouteMeta,
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
		resetPageBootstrapForRoute(to, (to.meta as CustomRouteMeta).customScriptTiming ?? 'immediate');
		next();
	});

	const corpusId = computed(() => router.currentRoute.value.params.corpus as string | undefined);
	const articleId = computed(() => router.currentRoute.value.params.docId as string | undefined);
	const routeMeta = computed(() => (router.currentRoute.value.meta as CustomRouteMeta) || null);
	let resolveInitialRouteState: () => void;
	const initialRouteStateApplied = new Promise<void>(resolve => (resolveInitialRouteState = resolve));
	return {
		router,
		corpusId,
		articleId,
		routeMeta,
		initialRouteStateApplied,

		install: (app => {
			router.install(app);
			provideCorpusId(app, corpusId);
			provideArticleId(app, articleId);
			provideRouteMeta(app, routeMeta);
			resolveInitialRouteState();
		}) satisfies FunctionPlugin,
	};
}

export { useCorpusId, useArticleId, useRouteMeta, createBlfRouter, type CustomRouteMeta };
