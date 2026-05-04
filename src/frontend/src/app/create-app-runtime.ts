import App from '@/App.vue';
import { createApi } from '@/_new/app/plugins/installApi';
import { createCorpusData } from '@/_new/app/plugins/installCorpusData';


import * as LoginSystem from '@/_new/shared/auth/loginsystem';
import { installApp } from '@/app/install-app';
import { startAppEffects } from '@/app/start-app-effects';
import { installStoreInspectorDevtools } from '@/devtools/store-inspector';
import { installHooksGlobal } from '@/interop/hooks';
import { installLegacyStoreGlobals, setMountedVueGlobals } from '@/interop/window-globals';
import router from '@/navigation/router';
import { computed, createApp, type App as VueApp } from 'vue';


export type AppRuntime = {
	app: VueApp;
	mount: (selector?: string) => unknown;
};



export async function createAppRuntime(): Promise<AppRuntime> {
	const user = await LoginSystem.user;

	const api = createApi({
		frontend: {	baseUrl: CONTEXT_URL, user },
		blacklab: {	baseUrl: BLS_URL, user },
	});
	const currentCorpusId = computed(() => router.currentRoute.value.params.indexId as string || null);
	const corpusData = createCorpusData(api.blacklabApi, api.frontendApi, currentCorpusId, user);

	const app = createApp(App);
	app.use(api);
	app.use(corpusData);


	installHooksGlobal();
	installLegacyStoreGlobals();

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