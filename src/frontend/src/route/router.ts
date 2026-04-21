import { createRouter, createWebHistory } from 'vue-router';


export type CustomRouteMeta = {
	name: string;
	getTitle?: (corpusDisplayName: string) => string;
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
			meta: { name: 'help', getTitle: (displayName: string) => displayName + ' Help' } satisfies CustomRouteMeta,
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			name: 'global-about',
			path: '/about',
			alias: '/about/:pathMatch(.*)*',
			meta: { name: 'about', getTitle: () => 'About' } satisfies CustomRouteMeta,
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
			meta: { name: 'article', getTitle: (displayName: string) => `${displayName} Article` } satisfies CustomRouteMeta,
			component: () => import('@/pages/article/ArticlePage.vue')
		},
		{
			name: 'about',
			path: '/:corpus/about',
			alias: '/:corpus/about/:pathMatch(.*)*',
			meta: { name: 'about', getTitle: (displayName: string) => `About ${displayName}` } satisfies CustomRouteMeta,
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			name: 'help',
			path: '/:corpus/help',
			alias: '/:corpus/help/:pathMatch(.*)*',
			meta: { name: 'help', getTitle: (displayName: string) => `${displayName} Help` } satisfies CustomRouteMeta,
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


// NOTE: (21 april 2026) - commented out because startup was running into a reflection loop.
// Code should be moved to app startup somewhere later in refactor cycle and cleaned up.

// Temp fix to keep exports consistent while refactoring startup and url state handling.
export const initialUrlStateApplied = Promise.resolve();

// === BEGIN Initial route decode 

// let pageLoadUrlDecoded = false;
// let initialUrlStateAppliedResolved = false;
// let resolveInitialUrlStateApplied: (() => void)|null = null;

// export const initialUrlStateApplied = new Promise<void>(resolve => {
// 	resolveInitialUrlStateApplied = resolve;
// });

// function markInitialUrlStateApplied() {
// 	if (initialUrlStateAppliedResolved) {
// 		return;
// 	}
// 	initialUrlStateAppliedResolved = true;
// 	resolveInitialUrlStateApplied?.();
// }


// router.beforeEach((to, from, next) => {

// 	// On first entry on the page, we need to decode the url.
// 	if (!pageLoadUrlDecoded && to.params.corpus) {
// 		pageLoadUrlDecoded = true;
// 		if (to.name === 'article' || to.name === 'search') {
// 			const parser = to.name === 'article' ? new UrlStateParserArticle() : new UrlStateParserSearch();
// 			// wait for store to initialize.
// 			const unwatch = watch(() => RootStore.get.loadingState(), state => {
// 				if (!state.isLoaded()) return;
// 				unwatch();
// 				// loaded, handle url parse now
// 				void parser
// 					.get()
// 					.then(stateFromUrl => RootStore.actions.replace(stateFromUrl))
// 					// .then(() => connectStoreStreams())
// 					.finally(() => markInitialUrlStateApplied());
// 			}, {
// 				deep: true,
// 			})	
// 		} else {
// 			markInitialUrlStateApplied();
// 		}
// 	}

// 	next();
// })

// === END Initial route decode

export default router;