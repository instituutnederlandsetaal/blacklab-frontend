import Vue from 'vue';
import Router from 'vue-router';

Vue.use(Router);

export default new Router({
	base: CONTEXT_URL,
	mode: 'history',
	routes: [
		{
			name: 'corpora',
			path: '/',
			alias: '',
			component: () => import('@/pages/corpora/CorporaPage.vue')
		},
		{
			name: 'global-help',
			path: '/help',
			alias: '/help/*',
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			name: 'global-about',
			path: '/about',
			alias: '/about/*',
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			name: 'global-configwizard',
			path: '/configwizard',
			alias: '/configwizard/*',
			component: () => import('@/pages/config/ConfigPage.vue'),
			// todo make this make sense.
			children: [
				{
					path: '/',
					name: 'global-config',
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
			component: () => import('@/pages/search/SearchPage.vue'),
		},
		{
			name: 'article',
			path: '/:corpus/docs/:docId',
			component: () => import('@/pages/article/ArticlePage.vue')
		},
		{
			name: 'about',
			path: '/:corpus/about',
			alias: '/:corpus/about/*',
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			name: 'help',
			path: '/:corpus/help',
			alias: '/:corpus/help/*',
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			name: 'configwizard',
			path: '/:corpus/configwizard/:tab?/',
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
