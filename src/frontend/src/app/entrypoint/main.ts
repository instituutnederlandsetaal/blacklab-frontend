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
import { createArticlePageState, provideArticleState } from '@/features/article/model/article-page-state';
import startGlobalCorpusDependentEffects from '@/features/corpus/effects';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import * as HistoryStore from '@/features/history/model/query-history-state';
import { provideActiveSearch } from '@/features/search/model/active-search';
import { createActiveSearch } from '@/features/search/model/active-search';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { LegacyFormRestorer } from '@/features/search/model/form/restore-legacy-form';
import { createSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSearchFormRestoration } from '@/features/search/model/search-form-restoration';
import { createSearchSummary, provideSearchSummary } from '@/features/search/model/search-summary';
import { createSubmittedFormRestoration, createSubmittedSearch } from '@/features/search/model/submitted-search';
import { installHooksGlobal, runHooks } from '@/interop/hooks';
import { installCorpusGlobal, installCustomizationApiGlobals, installLegacyStoreGlobals, installVueGlobals } from '@/interop/window-globals';
import { createInitialLoading } from '@/navigation/initial-loading';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';
import { createBlfRouter } from '@/navigation/router';
import { createArticleUrlBinding } from '@/url/article-state';
import { queryHistoryDetails, queryHistoryFromUrl } from '@/url/query-history';
import { createSearchUrlBinding } from '@/url/search-state';

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
	ViewStore.setPageSizePreference(() => GlobalResultsStore.getState().pageSize);
	const articleState = createArticlePageState(corpusState.corpus);
	const submittedSearch = createSubmittedSearch();
	RootStore.setSubmittedSearch(submittedSearch);
	HistoryStore.setUrlDecoder(queryHistoryDetails);
	HistoryStore.provideHistoryImport(app, async url => {
		const corpus = corpusState.corpus.value;
		if (!corpus) return;
		await HistoryStore.actions.importUrl(url, url =>
			queryHistoryFromUrl(url, {
				blacklabApi: api.blacklabApi,
				corpus,
				filterState: FilterStore.getState(),
				tagsetState: TagsetStore.getState(),
				customizations,
			}),
		);
	});
	const activeSearch = createActiveSearch(InterfaceStore.get.viewedResults, {
		corpus: corpusState.corpus,
		submitted: submittedSearch,
		global: GlobalResultsStore.getState,
		viewState: () => {
			const view = InterfaceStore.get.viewedResults();
			return view ? ViewStore.getOrCreateModule(view).getState() : undefined;
		},
		expandedRequestRange: () => {
			const view = InterfaceStore.get.viewedResults();
			return typeof view === 'string' && view ? ViewStore.getOrCreateModule(view).get.expandedRequestRange() : undefined;
		},
		withSpans: customizations.searchWithSpans,
		debug: debugSystem.debug,
	});
	const activeSearchParameters = activeSearch.parameters;
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
	provideActiveSearch(app, activeSearch);
	provideArticleState(app, articleState);
	app.use(customizationRegistry);
	app.use(customizations);
	app.component('Debug', DebugComponent);
	app.component('AudioPlayer', AudioPlayer);

	startGlobalCorpusDependentEffects(corpusState.contextLoader, api.blacklabApi, activeSearchParameters);

	installStoreInspectorDevtools(app);
	installCustomizationApiGlobals(customizationRegistry);

	const restoredForm = createSubmittedFormRestoration(submittedSearch, searchFormSystem.runtime);
	const searchSummary = createSearchSummary(submittedSearch, restoredForm);
	provideSearchSummary(app, searchSummary);
	const formRestoration = createSearchFormRestoration({
		corpus: corpusState.corpus,
		runtime: searchFormSystem.runtime,
		submitted: submittedSearch,
		restoredForm,
		beforeStateLoaded: () => runHooks('beforeStateLoaded'),
		restoreLegacy: (corpus, submitted) => {
			const viewedResults = InterfaceStore.get.viewedResults();
			const view = viewedResults ? ViewStore.getOrCreateModule(viewedResults).getState() : null;
			return new LegacyFormRestorer(
				{ blacklabApi: api.blacklabApi, corpus, customizations, filterState: FilterStore.getState(), tagsetState: TagsetStore.getState() },
				{
					submitted,
					viewedResults,
					groupBy: view?.groupBy ?? [],
					groupDisplayMode: view?.groupDisplayMode ?? null,
				},
			).get();
		},
	});
	app.use(formRestoration);
	const searchNavigation = createSearchUrlBinding(router.router, {
		corpus: corpusState.corpus,
		submittedSearch,
		restoreForms: formRestoration.restore,
		summary: searchSummary,
	});

	app.use(searchNavigation);
	app.use(createArticleUrlBinding(router.router, articleState, corpusState.corpus));
	const initialLoading = createInitialLoading(() =>
		isInitialPageReady(router.router.currentRoute.value, corpusState.contextLoader, pageBootstrap.contentReady.value, searchNavigation.initialReadSettled.value),
	);
	app.use(initialLoading);
	installLegacyStoreGlobals(app, customizationRegistry, activeSearchParameters);

	app.runWithContext(() => startCustomizationInterop());

	const instance = app.mount('#vue-root'); // mount early, so that the app is available for interop code (e.g. customjs) to use.
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
