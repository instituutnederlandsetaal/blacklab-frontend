import '@/utils/enable-polyfills';
// Global corpus-frontend styles.
import '@/global.scss';

import $ from '@/utils/jquery-globals';
import 'bootstrap';
import Vue, { createApp } from 'vue';
import router, { initialUrlStateApplied } from '@/route/router';


import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';

import Filters from '@/components/filters';

import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/components/Debug.vue';
import SearchPageComponent from '@/pages/search/SearchPage.vue';



import { init as initApi } from '@/api';
import i18n from '@/utils/i18n';
import * as loginSystem from '@/utils/loginsystem';

import '@/global.scss';
import { debugLogCat } from '@/utils/debug';

// --------------
// Initialize vue
// --------------
const errorHandler = (err: Error, vm: unknown, info: string) => {
	if (!err.message.includes('[vuex]' /* do not mutate vuex store state outside mutation handlers */)) { // already logged and annoying
		console.error(err);
	}
};

const renderErrorMixin = {
	// tslint:disable
	renderError(h: any, err: Error) {
		// Retrieve component stack
		let components = [this as unknown as Vue];
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
};

// if (PLAUSIBLE_DOMAIN && PLAUSIBLE_APIHOST) {
// 	Vue.use(VuePlausible, {
// 		domain: PLAUSIBLE_DOMAIN,
// 		trackLocalhost: true,
// 		apiHost: PLAUSIBLE_APIHOST,
// 	});
// 	//@ts-ignore
// 	Vue.$plausible.trackPageview();
// }
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
import connectStoreStreams from '@/store/streams';

const RootComponent = {
	i18n,
	render: () => <App />,
} as any;

$(document).ready(async () => {
	
	await i18n.init();
	const user = await LoginSystem.user;
	initApi('blacklab', BLS_URL, user);
	initApi('cf', CONTEXT_URL, user);
	RootStore.actions.user(user);
	// Don't do this before the url is parsed, as it controls the page url (among other things derived from the state).
	initialUrlStateApplied.then(() => connectStoreStreams());

	const app = createApp(RootComponent);
	app.config.errorHandler = errorHandler;
	app.mixin(renderErrorMixin);
	app.use(Filters);
	app.use(FloatingVue);
	app.use(RootStore.store as any);
	app.use(router);
	app.use(i18n);
	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);

	await router.isReady();
	// We can render before the tagset loads, the form just won't be populated from the url yet.
	(window as any).vueApp = app;
	(window as any).vueRoot = app.mount(document.querySelector('#vue-root')!);
});
