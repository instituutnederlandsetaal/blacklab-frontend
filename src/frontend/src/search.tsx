import 'bootstrap';
import 'bootstrap-select';
import 'bootstrap-select/dist/css/bootstrap-select.css';

import $ from 'jquery';
import Vue from 'vue';

// @ts-ignore
import VTooltip from 'v-tooltip';
//@ts-ignore
import VuePlausible from 'vue-plausible/lib/esm/vue-plugin.js';

import Filters from '@/components/filters';

import * as RootStore from '@/store/search/';
import * as FilterStore from '@/store/search/form/filters';
import UrlStateParser from '@/store/search/util/url-state-parser';

import connectStreamsToVuex from '@/store/search/streams';

import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/components/Debug.vue';
import SearchPageComponent from '@/pages/search/SearchPage.vue';



import { init as initApi } from '@/api';
import {i18n} from '@/utils/i18n';
import * as loginSystem from '@/utils/loginsystem';

import '@/global.scss';
import { debugLogCat } from '@/utils/debug';

// --------------
// Initialize vue
// --------------
Vue.config.productionTip = false;
Vue.config.errorHandler = (err, vm, info) => {
	if (!err.message.includes('[vuex]' /* do not mutate vuex store state outside mutation handlers */)) { // already logged and annoying
		ga('send', 'exception', { exDescription: err.message, exFatal: true });
		console.error(err);
	}
};
Vue.mixin({
	// tslint:disable
	renderError(h, err) {
		// Retrieve component stack
		let components = [this] as Vue[];
		while(components[components.length-1].$options.parent) {
			components.push(components[components.length-1].$options.parent as Vue)
		}
		return (
			<div class="well">
				<h3>Error in component! ({components.map(c => (c.$options as any)._componentTag).reverse().filter(v => !!v).join(' // ')})</h3>
				<pre style="color: red;">
					{err.stack}
				</pre>
			</div>
		)
	}
	// tslint:enable
});

if (PLAUSIBLE_DOMAIN && PLAUSIBLE_APIHOST) {
	Vue.use(VuePlausible, {
		domain: PLAUSIBLE_DOMAIN,
		trackLocalhost: true,
		apiHost: PLAUSIBLE_APIHOST,
	});
	//@ts-ignore
	Vue.$plausible.trackPageview();
}
Vue.use(Filters);
Vue.use(VTooltip, {
	popover: {
		defaultBaseClass: 'popover',
		defaultWrapperClass: 'wrapper',
		defaultInnerClass: 'popover-content',
		defaultArrowClass: 'arrow tooltip-arrow',
	}
});
Vue.component('Debug', DebugComponent);
Vue.component('AudioPlayer', AudioPlayer);

// Expose and declare some globals
(window as any).Vue = Vue;

/*
Rethink page initialization

- first initialize login system, attempt to login
- then initialize api objects with the login token
- then fetch corpus info
- initialize store?
- fetch tagset info
- initialize querybuilder
- then restore state from url
*/

type Hook = () => void|Promise<any>;
const isHook = (hook: any): hook is Hook => typeof hook === 'function';
declare const hooks: {
	beforeStoreInit?: Hook;
	beforeStateLoaded?: Hook;
};

async function runHook(hookName: keyof (typeof hooks)) {
	const hook = hooks[hookName];
	if (isHook(hook)) {
		debugLogCat('init', `Running hook ${hookName}...`);
		await hook();
		debugLogCat('init', `Finished running hook ${hookName}`);
	}
}

$(document).ready(async () => {
	// We can render before the tagset loads, the form just won't be populated from the url yet.
	(window as any).vueRoot = new Vue({
		i18n,
		store: RootStore.store,
		render: h => h(SearchPageComponent),
		async mounted() {
			// we do this after render, so the user has something to look at while we're loading.
			const user = await loginSystem.awaitInit(); // LOGIN SYSTEM
			initApi('blacklab', BLS_URL, user);
			initApi('cf', CONTEXT_URL, user);
			await runHook('beforeStoreInit');
			const success = await RootStore.init();
			if (!success) {
				return;
			}
			await runHook('beforeStateLoaded')
			const stateFromUrl = await new UrlStateParser(FilterStore.getState().filters).get();
			RootStore.actions.replace(stateFromUrl);
			// Don't do this before the url is parsed, as it controls the page url (among other things derived from the state).
			connectStreamsToVuex();
		},
	}).$mount(document.querySelector('#vue-root')!);
});
