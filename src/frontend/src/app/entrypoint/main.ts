import '@/utils/jquery-globals';
import 'bootstrap';

import '@/global.scss';

import FloatingVue from 'floating-vue';
import { createApp } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import { createCorpusContext } from '@/app/state/useCorpusContext';
import Filters from '@/components/filters';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { installStoreInspectorDevtools } from '@/devtools/store-inspector';
import startGlobalCorpusDependentEffects from '@/features/corpus/effects';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { createSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import { installHooksGlobal, runHooks } from '@/interop/hooks';
import { installCorpusGlobal, installCustomizationApiGlobals, installLegacyStoreGlobals, installVueGlobals } from '@/interop/window-globals';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import { createBlfRouter } from '@/navigation/router';
import startUrlSync from '@/url/url-state-sync';

import { createApi } from '@/shared/api';
import { createLoginSystem, type LoginSystemConfig } from '@/shared/auth/loginsystem';
import { createDebugSystem } from '@/shared/debug/debug';
import { createI18n } from '@/shared/i18n';

import AppRoot from '@/App.vue';
import DebugComponent from '@/shared/debug/Debug.vue';
import AudioPlayer from '@/shared/ui/AudioPlayer.vue';

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
		blacklab: { baseUrl: BLS_URL, user: loginSystem.user, blacklabVersion: loginSystem.blacklabVersion },
		frontend: { baseUrl: CONTEXT_URL, user: loginSystem.user },
	});

	installHooksGlobal();

	const app = createApp(AppRoot);

	const pageBootstrap = createPageBootstrapContext();
	const router = createBlfRouter(pageBootstrap);

	// Init the router early so the corpusId has fully settled
	// Not doing this would init the i18n and corpus context with a momentary null in corpusId,
	// even if we're currently on a URL where that isn't true.
	// It would make then fetch the base config data for nothing, then quickly swap it out once the route loads properly.
	// Which would be wasteful and cause a brief flash of the wrong data.
	app.use(router);
	await router.router.isReady();
	await runHooks('beforeStoreInit');
	const corpusState = createCorpusContext(api.blacklabApi, api.frontendApi, router.corpusId);
	const customizationRegistry = createCustomizationRegistry(corpusState.corpus);
	const customizations = createCustomizations(customizationRegistry, corpusState.corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
	RootStore.setCustomizations(customizations);
	corpusState.beforePublish(corpus => {
		/**
		 * Bring legacy singleton stores to the incoming generation before publishing
		 * the context. This prevents consumers from observing new context data with
		 * old store state; custom scripts mount only after publication.
		 */
		installCorpusGlobal(corpus);
		RootStore.init(corpus);
	});
	const i18n = createI18n(router.corpusId);

	const searchFormSystem = createSearchFormSystem({
		blacklabApi: api.blacklabApi,
		corpus: corpusState.corpus,
		customizations,
		tagset: corpusState.tagset,
		translate: i18n.translate,
	});

	app.use(loginSystem);
	app.use(debugSystem);
	app.use(pageBootstrap);
	app.use(api);
	app.use(i18n);
	app.use(Filters);
	app.use(FloatingVue);
	app.use(corpusState);
	app.use(searchFormSystem);
	app.use(customizationRegistry);
	app.use(customizations);
	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);

	startGlobalCorpusDependentEffects(corpusState.contextLoader, api.blacklabApi);

	installStoreInspectorDevtools(app);
	installLegacyStoreGlobals(app, customizationRegistry);
	installCustomizationApiGlobals(customizationRegistry);

	startUrlSync(router.router, {
		blacklabApi: api.blacklabApi,
		corpusContext: corpusState.contextLoader,
		indexId: router.corpusId,
		searchForms: searchFormSystem.runtime,
		customizations,
		beforeStateLoaded: () => runHooks('beforeStateLoaded'),
	});

	app.runWithContext(() => startCustomizationInterop());

	const instance = app.mount('#vue-root'); // mount early, so that the app is available for interop code (e.g. customjs) to use.
	installVueGlobals(app, instance);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
	void start();
}
