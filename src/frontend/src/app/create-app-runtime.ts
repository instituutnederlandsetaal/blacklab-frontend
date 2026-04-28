import App from '@/App.vue';

import { init as initApi } from '@/_new/shared/api';
import * as LoginSystem from '@/_new/shared/auth/loginsystem';
import { installApp } from '@/app/install-app';
import { startAppEffects } from '@/app/start-app-effects';
import { installStoreInspectorDevtools } from '@/devtools/store-inspector';
import { installHooksGlobal } from '@/interop/hooks';
import { installLegacyStoreGlobals, setMountedVueGlobals } from '@/interop/window-globals';
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
	installLegacyStoreGlobals();

	const app = createApp(App);
	installApp(app);
	installStoreInspectorDevtools(app);
	startAppEffects(app);

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