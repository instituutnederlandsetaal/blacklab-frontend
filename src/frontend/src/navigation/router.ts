import { createRouter, createWebHistory } from 'vue-router';

import { resetPageBootstrapForRoute, type CustomScriptTiming } from '@/navigation/page-bootstrap';


/** 
 * We need some metadata about the current route in order for customJs and customCss to work correctly.
 * Store it in a standardized object so we can be sure it's available as expected.
 */
export type CustomRouteMeta = {
	name: string;
	getTitle?: (corpusDisplayName: string) => string;
	customScriptTiming?: CustomScriptTiming;
}

const router = createRouter({
	history: createWebHistory(CONTEXT_URL),
	routes: [
		{
			name: 'corpora',
			path: '/',
			meta: { name: 'corpora', getTitle: () => 'Corpora' } satisfies CustomRouteMeta,
			component: () => import('@/pages/corpora/CorporaPage.vue')
		},
		{
			name: 'global-help',
			path: '/help',
			alias: '/help/:pathMatch(.*)*',
			meta: { name: 'help', getTitle: (displayName: string) => displayName + ' Help', customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			name: 'global-about',
			path: '/about',
			alias: '/about/:pathMatch(.*)*',
			meta: { name: 'about', getTitle: () => 'About', customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
			component: () => import('@/pages/about/AboutPage.vue')
		},
		
		{
			path: '/:corpus/',
			redirect: '/:corpus/search',
		},
		{
			name: 'search',
			path: '/:corpus/search',
			alias: '/:corpus/search/:pathMatch(.*)*',
			meta: { name: 'search', getTitle: (displayName: string) => `${displayName} Search` } satisfies CustomRouteMeta,
			component: () => import('@/pages/search/SearchPage.vue'),
		},
		{
			name: 'article',
			path: '/:corpus/docs/:docId',
			meta: { name: 'article', getTitle: (displayName: string) => `${displayName} Article`, customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
			component: () => import('@/pages/article/ArticlePage.vue')
		},
		{
			name: 'about',
			path: '/:corpus/about',
			alias: '/:corpus/about/:pathMatch(.*)*',
			meta: { name: 'about', getTitle: (displayName: string) => `About ${displayName}`, customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			name: 'help',
			path: '/:corpus/help',
			alias: '/:corpus/help/:pathMatch(.*)*',
			meta: { name: 'help', getTitle: (displayName: string) => `${displayName} Help`, customScriptTiming: 'after-page-bootstrap' } satisfies CustomRouteMeta,
			component: () => import('@/pages/help/HelpPage.vue'),
		},
		{
			path: '/configwizard',
			alias: '/configwizard/:pathMatch(.*)*',
			meta: { name: 'configwizard' },
			component: () => import('@/pages/config/ConfigPage.vue'),
			// todo make this make sense.
			children: [
				{
					path: '/:pathMatch(.*)*',
					name: 'global-configwizard',
					component: () => import('@/pages/config/CorpusPicker.vue'),
				}
			]
		},
		{
			name: 'configwizard',
			path: '/:corpus/configwizard',
			meta: { name: 'configwizard' } satisfies CustomRouteMeta,
			component: () => import('@/pages/config/CorpusConfig.vue'),
			props: route => ({
				id: route.params.id,
				activeTab: route.params.tab,
				tabs: ['tagset builder', 'interface']
			}),
			children: [{
				path: '/:corpus/configwizard/pos',
				name: 'tagset builder',
				component: () => import('@/pages/config/POS.vue')
			},
			{
				path: '/:corpus/configwizard/interface',
				name: 'interface',
				component: () => import('@/pages/config/Interface.vue')
			}]
		},
	],
});

router.beforeResolve((to, _from, next) => {
	resetPageBootstrapForRoute(to, (to.meta as CustomRouteMeta).customScriptTiming ?? 'immediate');
	next();
});

// URL initial decode remains disabled during the structural refactor.
// Keep this resolved promise so parked URL-state code can await it without blocking startup.
export const initialUrlStateApplied = Promise.resolve();

export default router;

