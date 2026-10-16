import '@/utils/jquery-globals';
import 'bootstrap';

import '@/global.scss';

import FloatingVue from 'floating-vue';
import { createApp, shallowRef } from 'vue';
import type { RouteLocationNormalized } from 'vue-router';

import * as ArticleStore from '@/app/state/article-configuration';
import * as LegacyFilterStore from '@/app/state/legacy-filter-state';
import * as UIStore from '@/app/state/ui-state';
import { createCorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import type { createSearchFeature } from '@/features/search/search-feature';
import { installHooksGlobal, runHooks } from '@/interop/hooks';
import { installCommonStoreGlobals, installCorpusGlobal, installCustomizationApiGlobals, installVueGlobals } from '@/interop/window-globals';
import { createInitialLoading } from '@/navigation/initial-loading';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import { createBlfRouter } from '@/navigation/router';

import { isInitialPageReady } from './initial-readiness';

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
	return { mode: 'blacklab', blacklabBaseUrl: BLS_URL };
}

async function start() {
	const loginSystem = await createLoginSystem(getLoginSystemConfig());
	const debugSystem = createDebugSystem({ enabledByDefault: import.meta.env.DEV, visible: DEBUG_INFO_VISIBLE });
	const api = await createApi({
		blacklab: { baseUrl: BLS_URL, user: loginSystem.user, blacklabVersion: loginSystem.blacklabVersion },
		frontend: { baseUrl: CONTEXT_URL, user: loginSystem.user },
	});
	installHooksGlobal();

	const app = createApp(AppRoot);
	const pageBootstrap = createPageBootstrapContext();
	const router = createBlfRouter(pageBootstrap);
	// Resolve the corpus ID first so a corpus URL cannot briefly load the global configuration.
	app.use(router);
	await router.router.isReady();
	await runHooks('beforeStoreInit');

	const corpusState = createCorpusContext(api.blacklabApi, api.frontendApi, router.corpusId);
	const customizationRegistry = createCustomizationRegistry(corpusState.corpus);
	const customizations = createCustomizations(customizationRegistry, corpusState.corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
	corpusState.beforePublish(context => {
		// Publish corpus data only after legacy singletons have been reset, so consumers cannot
		// observe the new context with settings from the previous corpus. Scripts run after publication.
		installCorpusGlobal(context);
		UIStore.init(context);
		TagsetStore.init(context);
		LegacyFilterStore.init(context);
		ArticleStore.init(context);
	});
	const i18n = createI18n(router.corpusId);

	app.use(loginSystem);
	app.use(debugSystem);
	app.use(pageBootstrap);
	app.use(api);
	app.use(i18n);
	app.use(FloatingVue);
	app.use(corpusState);
	app.use(customizationRegistry);
	app.use(customizations);
	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);
	installCustomizationApiGlobals(customizationRegistry);
	installCommonStoreGlobals(corpusState.corpus, customizationRegistry);

	const searchFeature = shallowRef<ReturnType<typeof createSearchFeature>>();
	let searchInstallation: Promise<void> | undefined;
	let articleInstallation: Promise<void> | undefined;
	async function preparePage(route: RouteLocationNormalized) {
		if (route.name === 'search') {
			searchInstallation ??= import('@/features/search/entrypoint')
				.then(async ({ createSearchFeature }) => {
					const feature = createSearchFeature({
						router: router.router,
						corpusState,
						blacklabApi: api.blacklabApi,
						customizations,
						translate: i18n.translate,
						debug: debugSystem.debug,
					});
					app.use(feature);
					searchFeature.value = feature;
					if (import.meta.env.DEV) {
						try {
							const { installStoreInspectorDevtools } = await import('@/devtools/store-inspector');
							installStoreInspectorDevtools(app);
						} catch (error) {
							console.error('Could not load the store inspector', error);
						}
					}
				})
				.catch(error => {
					searchInstallation = undefined;
					throw error;
				});
			await searchInstallation;
		} else if (route.name === 'article') {
			articleInstallation ??= import('@/features/article/entrypoint')
				.then(({ createArticleFeature }) => {
					app.use(createArticleFeature({ corpus: corpusState.corpus, router: router.router }));
				})
				.catch(error => {
					articleInstallation = undefined;
					throw error;
				});
			await articleInstallation;
		}
	}

	// The initial route resolved before this guard existed; subsequent routes wait here for their providers.
	await preparePage(router.router.currentRoute.value);
	router.router.beforeEach(preparePage);
	app.use(
		createInitialLoading(() =>
			isInitialPageReady(router.router.currentRoute.value, corpusState.contextLoader, pageBootstrap.contentReady.value, searchFeature.value?.initialReadSettled.value ?? true),
		),
	);
	app.runWithContext(() => startCustomizationInterop());
	const instance = app.mount('#vue-root');
	installVueGlobals(app, instance);
}

function showStartupError(cause: unknown) {
	console.error('Could not start BlackLab Frontend', cause);
	const status = document.getElementById('startup-status') ?? document.body;
	status.setAttribute('role', 'alert');
	const content = document.createElement('main');
	content.className = 'startup-content';
	const heading = document.createElement('h1');
	heading.textContent = 'Could not load the search interface';
	const message = document.createElement('p');
	message.textContent = cause instanceof Error && cause.message ? cause.message : 'An unexpected error occurred.';
	const retry = document.createElement('button');
	retry.type = 'button';
	retry.textContent = 'Reload page';
	retry.addEventListener('click', () => window.location.reload());
	content.replaceChildren(heading, message, retry);
	status.querySelector('.startup-content')?.remove();
	if (status === document.body) status.replaceChildren(content);
	else status.append(content);
}

function boot() {
	void start().catch(showStartupError);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
	boot();
}
