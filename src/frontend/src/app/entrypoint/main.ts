import '@/utils/jquery-globals';
import 'bootstrap';

import '@/global.scss';

import FloatingVue from 'floating-vue';
import HighchartsVue from 'highcharts-vue';
import { createApp, watchEffect } from 'vue';

import { init as initApi } from '@/api';
import Filters from '@/components/filters';
import { installStoreInspectorDevtools } from '@/devtools/store-inspector';
import { startCorpusBootstrapEffect } from '@/features/corpus/effects/corpus-bootstrap.effect';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { installHooksGlobal } from '@/interop/hooks';
import { installLegacyStoreGlobals, setMountedVueGlobals } from '@/interop/window-globals';
import { indexId } from '@/navigation/route-context';
import router from '@/navigation/router';
import * as LoginSystem from '@/utils/loginsystem';

import { createI18n } from '@/shared/i18n';

import AppRoot from '@/App.vue';
import AudioPlayer from '@/components/AudioPlayer.vue';
import DebugComponent from '@/components/Debug.vue';

async function start() {
	const user = await LoginSystem.user;
	const i18n = createI18n();

	initApi('blacklab', BLS_URL, user);
	initApi('frontend', CONTEXT_URL, user);
	installHooksGlobal();
	installLegacyStoreGlobals();

	const app = createApp(AppRoot);

	app.use(i18n);
	app.use(Filters);
	app.use(FloatingVue);
	app.use(router);
	app.use(i18n);
	app.use(HighchartsVue);

	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);

	installStoreInspectorDevtools(app);
	watchEffect(() => i18n.setIndexId(indexId.value));
	startCorpusBootstrapEffect();
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
