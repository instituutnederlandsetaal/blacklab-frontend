import '@/utils/jquery-globals';
import 'bootstrap';

import '@/global.scss';

import FloatingVue from 'floating-vue';
import HighchartsVue from 'highcharts-vue';
import { createApp } from 'vue';

import { createCorpusContext } from '@/app/state/useCorpusContext';
import Filters from '@/components/filters';
import { installStoreInspectorDevtools } from '@/devtools/store-inspector';
import { startCorpusBootstrapEffect } from '@/features/corpus/effects/corpus-bootstrap.effect';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { setBlackLabPaths } from '@/features/search/model/form/filter-state';
import { initSelectedSubcorpusLoader } from '@/features/search/resources/selected-subcorpus-count.resource';
import { installHooksGlobal } from '@/interop/hooks';
import { installLegacyStoreGlobals, setMountedVueGlobals } from '@/interop/window-globals';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import { createBlfRouter } from '@/navigation/router';

import { createApi } from '@/shared/api';
import { createLoginSystem, type LoginSystemConfig } from '@/shared/auth/loginsystem';
import { createDebugSystem } from '@/shared/debug/debug';
import { createI18n } from '@/shared/i18n';

import AppRoot from '@/App.vue';
import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/shared/debug/Debug.vue';

function getLoginSystemConfig(): LoginSystemConfig {
	if (OIDC_AUTHORITY && OIDC_CLIENT_ID && OIDC_METADATA_URL) {
		return {
			mode: 'oidc',
			authority: OIDC_AUTHORITY,
			clientId: OIDC_CLIENT_ID,
			metadataUrl: OIDC_METADATA_URL,
			contextUrl: CONTEXT_URL,
		};
	}

	return {
		mode: 'blacklab',
		blacklabBaseUrl: BLS_URL,
	};
}

async function start() {
	const loginSystem = await createLoginSystem(getLoginSystemConfig());
	const debugSystem = createDebugSystem({
		enabledByDefault: import.meta.env.DEV,
		visible: DEBUG_INFO_VISIBLE,
	});
	const api = await createApi({
		blacklab: { baseUrl: BLS_URL, user: loginSystem.user, apiVersion: loginSystem.apiVersion },
		frontend: { baseUrl: CONTEXT_URL, user: loginSystem.user },
	});
	const pageBootstrap = createPageBootstrapContext();
	const router = createBlfRouter(pageBootstrap);
	const corpusState = createCorpusContext(api.blacklabApi, api.frontendApi, router.corpusId);
	const i18n = createI18n(router.corpusId);

	// initCorpusDataLoader(api.blacklabApi, api.frontendApi);
	initSelectedSubcorpusLoader(api.blacklabApi);
	setBlackLabPaths(api.blacklabPaths);
	installHooksGlobal();
	installLegacyStoreGlobals();

	const app = createApp(AppRoot);
	app.use(loginSystem);
	app.use(debugSystem);
	app.use(pageBootstrap);
	app.use(api);
	app.use(i18n);
	app.use(Filters);
	app.use(FloatingVue);
	app.use(router);
	app.use(corpusState);
	app.use(HighchartsVue);

	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);

	installStoreInspectorDevtools(app);
	startCorpusBootstrapEffect(app);
	// startStoreToUrlReflection(),
	app.runWithContext(() => startCustomizationInterop());

	const instance = app.mount('#vue-root'); // mount early, so that the app is available for interop code (e.g. customjs) to use.
	setMountedVueGlobals(app, instance);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
	void start();
}
