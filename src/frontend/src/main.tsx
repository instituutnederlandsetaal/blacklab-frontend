import 'bootstrap';
import 'bootstrap-select';
import 'bootstrap-select/dist/css/bootstrap-select.css';

// Global corpus-frontend styles.
import '@/global.scss';


import $ from 'jquery';
import Vue from 'vue';

// @ts-ignore
import VTooltip from 'v-tooltip';
//@ts-ignore
import VuePlausible from 'vue-plausible/lib/esm/vue-plugin.js';

import Filters from '@/components/filters';

import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/components/Debug.vue';

// --------------
// Initialize vue
// --------------
Vue.config.productionTip = false;
Vue.config.errorHandler = (err, vm, info) => {
	if (!err.message.includes('[vuex]' /* do not mutate vuex store state outside mutation handlers */)) { // already logged and annoying
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

// if (PLAUSIBLE_DOMAIN && PLAUSIBLE_APIHOST) {
// 	Vue.use(VuePlausible, {
// 		domain: PLAUSIBLE_DOMAIN,
// 		trackLocalhost: true,
// 		apiHost: PLAUSIBLE_APIHOST,
// 	});
// 	//@ts-ignore
// 	Vue.$plausible.trackPageview();
// }
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


// --- HOOKS SYSTEM ---

// Internal storage for hooks
type Hook = () => void | Promise<any>;
const _hooksStore: Record<string, Hook[]> = {};
// Proxy to allow both assignment and function-call registration
// e.g. hooks.something = function() { ... } or hooks.something(fn) to register a hook
// @ts-ignore
globalThis.hooks = new Proxy({}, {
	get(target, prop: string) {
		// Return a function to allow hooks.anything(fn) registration
		return (fn: Hook) => {
			if (!_hooksStore[prop]) _hooksStore[prop] = [];
			_hooksStore[prop].push(fn);
		};
	},
	set(target, prop: string, value: any) {
		if (!_hooksStore[prop as string]) _hooksStore[prop as string] = [];
		_hooksStore[prop as string].push(value);
		return true;
	}
}) as {
	[key: string]: ((fn: Hook) => void) & Hook[];
};

// Helper to get all hooks for a given name
function getHooks(name: string): Hook[] {
	return _hooksStore[name] || [];
}


function isPromise(obj: any): obj is Promise<any> {
	return !!obj && typeof obj.then === 'function';
}

async function runHook(hookName: string) {
	const hooksArr = getHooks(hookName);
	debugLogCat('init', `Running hook ${hookName}...`);
	for (const hook of hooksArr) {
		if (typeof hook === 'function') {
			await hook();
		} else if (isPromise(hook)) {
			await hook;
		}
	}
	debugLogCat('init', `Finished running hook ${hookName}`);
}

// --- END HOOKS SYSTEM ---

import App from '@/App.vue';


import * as LoginSystem from '@/utils/loginsystem';
import * as RootStore from '@/store';

import { init as initApi } from '@/api';
$(document).ready(async () => {
	const user = await LoginSystem.user;
	initApi('blacklab', BLS_URL, user);
	initApi('cf', CONTEXT_URL, user);
	RootStore.actions.user(user);

	// We can render before the tagset loads, the form just won't be populated from the url yet.
	(window as any).vueRoot = new App().$mount(document.querySelector('#vue-root')!);
	// connectStreamsToVuex();
});
