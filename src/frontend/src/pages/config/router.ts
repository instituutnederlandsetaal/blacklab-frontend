import Vue from 'vue';
import VueRouter, {RouteConfig} from 'vue-router';

import ConfigPage from './ConfigPage.vue';
import CorpusConfig from './CorpusConfig.vue';
import CorpusPicker from './CorpusPicker.vue';
import ConfigPOS from './POS.vue';
import ConfigInterface from './Interface.vue';

declare const CONTEXT_URL: string;
declare const INDEX_ID: string|null;

Vue.use(VueRouter);


const router = new VueRouter({
	base: CONTEXT_URL, // guaranteed not to end in a slash
	mode: 'history',

	// Routers in the BlackLab Frontend are interesting, this is a legacy holdover
	// without corpus: /blacklab-frontend/${page}
	// with corpus: /blacklab-frontend/${corpus}/${page}

	// since this page (the configwizard) is only served on paths where /configwizard is part of the url (as the ${page} part)
	// we don't have to take into account all other possible urls.
	// just bind on '/' and handle both /configwizard and /${corpus}/configwizard
	routes: [{
		name: 'config',
		path: '/configwizard/',
		component: ConfigPage,
		children: [{
			name: 'no_corpus',
			path: '/',
			component: CorpusPicker,
		}]
	}, {
		name: 'corpus',
		path: '/:id/configwizard/:tab?/',
		component: CorpusConfig,
		props: route => ({
			id: route.params.id,
			activeTab: route.params.tab,
			tabs: ['tagset builder', 'interface']
		}),
		children: [{
			name: 'tagset builder',
			path: '/:id/configwizard/pos',
			component: ConfigPOS
		}, {
			name: 'interface',
			path: '/:id/configwizard/interface',
			component: ConfigInterface
		}]
	}],
});

export default router;