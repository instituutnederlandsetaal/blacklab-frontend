import '@/_new/app/features/interop/jquery-globals';
import 'bootstrap';

// import { installStoreInspectorDevtools } from '@/_new/app/features/devtools/store-inspector';
import '@/global.scss';
import 'floating-vue/dist/style.css';

import FloatingVue from 'floating-vue';
import HighchartsVue from 'highcharts-vue';
import { createApp, effectScope, type App, type ObjectPlugin } from 'vue';

// import { installHooksGlobal } from '@/interop/hooks';
import { installLegacyStoreGlobals, setMountedVueGlobals } from '@/_new/app/features/interop/window-globals';
import { startCorpusDataToLegacyStoreInterop } from '@/_new/app/plugins/effects/corpus-bootstrap.effect';
import { startCustomizationInterop } from '@/_new/app/plugins/effects/page-customization.effect';
import { createApi } from '@/_new/app/plugins/installApi';
import { createCorpusData } from '@/_new/app/plugins/installCorpusData';
import { createRouteBootstrapPlugin } from '@/_new/app/plugins/installRoutePageBootstrapped';
// import Filters from '@/components/filters';
import createRouter from '@/_new/app/plugins/installRouter';
import * as LoginSystem from '@/_new/shared/auth/loginsystem';
import * as i18n from '@/_new/shared/i18n/i18n';

import DebugComponent from '@/_new/app/features/debug/Debug.vue';
import AppComponent from '@/_new/app/ui/App.vue';
import AudioPlayer from '@/_new/widgets/AudioPlayer.vue';

const globalComponents: ObjectPlugin = {
	install(app: App) {
		// app.use(Filters);
		app.use(FloatingVue);
		app.use(i18n);
		app.use(HighchartsVue);

		app.component('Debug', DebugComponent);
		app.component('AudioPlayer', AudioPlayer);
	},
};

async function main() {
	const user = await LoginSystem.user;
	const api = createApi({
		frontend: { baseUrl: CONTEXT_URL, user },
		blacklab: { baseUrl: BLS_URL, user },
	});
	const { currentCorpusId, ...router } = createRouter();
	const corpusData = createCorpusData(api.blacklabApi, api.frontendApi, currentCorpusId);
	const pageBootstrap = createRouteBootstrapPlugin();

	const app = createApp(AppComponent);
	app.use(api);
	app.use(router);
	app.use(corpusData);
	app.use(pageBootstrap);
	app.use(i18n);
	app.use(globalComponents);

	// expose things on window
	// installHooksGlobal();
	installLegacyStoreGlobals();
	// installStoreInspectorDevtools(app);

	// start some reactivity
	// TODO thse should become plugins that expose reactives through use* functions
	// Need to create an effect, so watchers etc are correctly disposed when the app is unmounted
	// and need to set the app as 'correct' so use*() functions can inject the correct value (for the current app).
	const eff = effectScope();
	eff.run(() =>
		app.runWithContext(() => {
			startCorpusDataToLegacyStoreInterop();
			startCustomizationInterop();
		}),
	);
	app.onUnmount(() => eff.stop());

	const root = app.mount('#vue-root');
	setMountedVueGlobals(app, root);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', main);
} else {
	void main();
}
