import '@/utils/jquery-globals';
import 'bootstrap';

import '@/global.scss';

import FloatingVue from 'floating-vue';
import HighchartsVue from 'highcharts-vue';
import { createApp } from 'vue';

import { createCorpusState } from '@/app/state/useCorpusContext';
import Filters from '@/components/filters';
import { installStoreInspectorDevtools } from '@/devtools/store-inspector';
import { startCorpusBootstrapEffect } from '@/features/corpus/effects/corpus-bootstrap.effect';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { setBlackLabPaths } from '@/features/search/model/form/filter-state';
import { initSelectedSubcorpusLoader } from '@/features/search/resources/selected-subcorpus-count.resource';
import { installHooksGlobal } from '@/interop/hooks';
import { installLegacyStoreGlobals, setMountedVueGlobals } from '@/interop/window-globals';
import { createBlfRouter } from '@/navigation/router';
import * as LoginSystem from '@/utils/loginsystem';

import { createApi } from '@/shared/api';
import { createI18n } from '@/shared/i18n';

import AppRoot from '@/App.vue';
import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/components/Debug.vue';

async function start() {
	const user = await LoginSystem.user;
	const api = await createApi({ blacklab: { baseUrl: BLS_URL, user }, frontend: { baseUrl: CONTEXT_URL, user } });
	const router = createBlfRouter();
	const corpusState = createCorpusState(api.blacklabApi, api.frontendApi, router.corpusId);
	const i18n = createI18n(router.corpusId);

	// initCorpusDataLoader(api.blacklabApi, api.frontendApi);
	initSelectedSubcorpusLoader(api.blacklabApi);
	setBlackLabPaths(api.blacklabPaths);
	installHooksGlobal();
	installLegacyStoreGlobals();

	const app = createApp(AppRoot);
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
