import Vue from 'vue';
import Router from 'vue-router';

Vue.use(Router);

export default new Router({
	base: CONTEXT_URL,
	mode: 'history',
	routes: [
		{
			path: '/',
			name: 'corpora',
			component: () => import('@/pages/corpora/CorporaPage.vue')
		},
		{
			path: '/help',
			name: 'global-help',
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			path: '/about',
			name: 'global-about',
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			path: '/configwizard/',
			component: () => import('@/pages/config/ConfigPage.vue'),
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
			beforeEnter: (to, from, next) => {
				console.log('entering corpus page', to)
				next();
			},
		},
		{
			path: '/:corpus/search/*',
			name: 'search',
			beforeEnter: (to, from, next) => {
				console.log('entering search page', to);
				next();
			},
			component: () => import('@/pages/search/SearchPage.vue')
		},
		{
			path: '/:corpus/docs/*',
			name: 'article',
			component: () => import('@/pages/article/ArticlePage.vue')
		},
		{
			path: '/:corpus/about',
			name: 'about',
			component: () => import('@/pages/about/AboutPage.vue')
		},
		{
			path: '/:corpus/help',
			name: 'help',
			component: () => import('@/pages/help/HelpPage.vue')
		},
		{
			path: '/:corpus/configwizard/:tab?/',
			name: 'corpus',
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
