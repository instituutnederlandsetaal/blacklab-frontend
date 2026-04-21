import App from '@/App.vue';

import { init as initApi } from '@/api';
import { installApp } from '@/app/install-app';
import { startAppEffects } from '@/app/start-app-effects';
import { installHooksGlobal } from '@/interop/hooks';
import { setMountedVueGlobals } from '@/interop/window-globals';
import * as LoginSystem from '@/utils/loginsystem';
import { createApp, type App as VueApp } from 'vue';

let apiClientsInitialized = false;

export type AppRuntime = {
	app: VueApp;
	mount: (selector?: string) => unknown;
};

function initializeApiClients(user: Awaited<typeof LoginSystem.user>) {
	if (apiClientsInitialized) {
		return;
	}

	initApi('blacklab', BLS_URL, user);
	initApi('frontend', CONTEXT_URL, user);
	apiClientsInitialized = true;
}

export async function createAppRuntime(): Promise<AppRuntime> {
	const user = await LoginSystem.user;
	initializeApiClients(user);
	installHooksGlobal();

	const app = createApp(App);
	installApp(app);
	startAppEffects();

	return {
		app,
		mount(selector = '#vue-root') {
			const target = document.querySelector(selector);
			if (!target) {
				throw new Error(`Could not find Vue mount target '${selector}'`);
			}

			const root = app.mount(target);
			setMountedVueGlobals(app, root);
			return root;
		}
	};
}