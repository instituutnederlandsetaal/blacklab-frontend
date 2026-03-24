import Vue from 'vue';
import Router from 'vue-router';

Vue.use(Router);

const router = new Router({
	base: CONTEXT_URL,
	mode: 'history',
	routes: [
		{
			name: 'corpora',
			path: '/',
			alias: '',
			meta: { name: 'corpora', getTitle: () => 'Corpora' },
			component: () => import('@/pages/corpora/CorporaPage.vue')
		},
		{
			name: 'global-help',
			path: '/help',
			alias: '/help/*',
			meta: { name: 'help', getTitle: (displayName: string) => displayName + ' Help' },
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			name: 'global-about',
			path: '/about',
			alias: '/about/*',
			meta: { name: 'about', getTitle: () => 'About' },
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			path: '/configwizard',
			alias: '/configwizard/*',
			meta: { name: 'configwizard' },
			component: () => import('@/pages/config/ConfigPage.vue'),
			// todo make this make sense.
			children: [
				{
					path: '/',
					name: 'global-configwizard',
					component: () => import('@/pages/config/CorpusPicker.vue'),
				}
			]
		},
		{
			path: '/:corpus/',
			redirect: '/:corpus/search',
		},
		{
			name: 'search',
			path: '/:corpus/search',
			alias: '/:corpus/search/*',
			meta: { name: 'search', getTitle: (displayName: string) => `${displayName} Search` },
			component: () => import('@/pages/search/SearchPage.vue'),
		},
		{
			name: 'article',
			path: '/:corpus/docs/:docId',
			meta: { name: 'article', getTitle: (displayName: string) => `${displayName} Article` },
			component: () => import('@/pages/article/ArticlePage.vue')
		},
		{
			name: 'about',
			path: '/:corpus/about',
			alias: '/:corpus/about/*',
			meta: { name: 'about', getTitle: (displayName: string) => `About ${displayName}` },
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			name: 'help',
			path: '/:corpus/help',
			alias: '/:corpus/help/*',
			meta: { name: 'help', getTitle: (displayName: string) => `${displayName} Help` },
			component: () => import('@/pages/help/HelpPage.vue'),
		},
		{
			name: 'configwizard',
			path: '/:corpus/configwizard/:tab?/',
			meta: { name: 'configwizard' },
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

import * as RootStore from '@/store';
import * as ArticleStore from '@/store/article';
import { setIndexId as setI18nIndexId } from '@/utils/i18n';
import UrlStateParserSearch from '@/url/url-state-parser-search';
import UrlStateParserArticle from '@/url/url-state-parser-article';
import { promiseFromLoadableStream } from '@/utils/loadable-streams';

let pageLoadUrlDecoded = false;
let initialUrlStateAppliedResolved = false;
let resolveInitialUrlStateApplied: (() => void)|null = null;

export const initialUrlStateApplied = new Promise<void>(resolve => {
	resolveInitialUrlStateApplied = resolve;
});

function markInitialUrlStateApplied() {
	if (initialUrlStateAppliedResolved) {
		return;
	}
	initialUrlStateAppliedResolved = true;
	resolveInitialUrlStateApplied?.();
}

router.beforeEach((to, from, next) => {
	RootStore.actions.indexId(to.params.corpus);
	setI18nIndexId(to.params.corpus);
	ArticleStore.actions.docId(to.params.docId);

	// On first entry on the page, we need to decode the url.
	if (!pageLoadUrlDecoded && to.params.corpus) {
		pageLoadUrlDecoded = true;
		if (to.name === 'article' || to.name === 'search') {
			const parser = to.name === 'article' ? new UrlStateParserArticle() : new UrlStateParserSearch();
			// wait for store to initialize.
			promiseFromLoadableStream(RootStore.corpusData$, 'root loading state')
			.then(() => parser.get())
			.then(stateFromUrl => RootStore.actions.replace(stateFromUrl))
			.finally(() => markInitialUrlStateApplied());
		} else {
			markInitialUrlStateApplied();
		}
	}

	next();
})

export default router;