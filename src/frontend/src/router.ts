import Vue from 'vue';
import Router from 'vue-router';
import CorporaPage from '@/pages/corpora/CorporaPage.vue';
import ConfigPage from '@/pages/config/ConfigPage.vue';
import CorpusConfig from '@/pages/config/CorpusConfig.vue';
import CorpusPicker from '@/pages/config/CorpusPicker.vue';
import ConfigPOS from '@/pages/config/POS.vue';
import ConfigInterface from '@/pages/config/Interface.vue';

Vue.use(Router);

export default new Router({
	mode: 'history',
	routes: [
		{
			path: '/',
			name: 'corpora',
			component: CorporaPage
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
			name: 'global-config',
			component: ConfigPage,
			children: [
				{
					path: '/',
					name: 'no_corpus',
					component: CorpusPicker,
				}
			]
		},
		{
			path: '/:corpus',
			redirect: '/:corpus/search',
			children: [
				{
					path: '/:corpus/search',
					name: 'search',
					component: () => import('@/pages/CorpusSearchPage.vue')
				},
				{
					path: '/:corpus/article',
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
					component: CorpusConfig,
					props: route => ({
						id: route.params.id,
						activeTab: route.params.tab,
						tabs: ['tagset builder', 'interface']
					}),
					children: [{
						path: '/:corpus/configwizard/pos',
						name: 'tagset builder',
						component: ConfigPOS
					},
					{
						path: '/:corpus/configwizard/interface',
						name: 'interface',
						component: ConfigInterface
					}]
				},
			]
		},


	]
});