import { toRef, type App, type MaybeRefOrGetter } from 'vue';
import type { Router } from 'vue-router';

import type { createCorpusContext } from '@/app/state/useCorpusContext';
import type { Customizations } from '@/customization-api/internal/internal-api';
import * as HistoryStore from '@/features/history/model/query-history-state';
import { startSelectedSubcorpusEffect } from '@/features/search/effects/selected-subcorpus.effect';
import { createActiveSearch, provideActiveSearch } from '@/features/search/model/active-search';
import { createSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import { DEFAULT_RESULT_CONTEXT_SIZE, provideResultContextSize } from '@/features/search/model/results/result-context-size';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSearchFormRestoration } from '@/features/search/model/search-form-restoration';
import { createSearchStore, provideSearchActions } from '@/features/search/model/search-store';
import { createSearchSummary, provideSearchSummary } from '@/features/search/model/search-summary';
import { createSubmittedFormRestoration, createSubmittedSearch } from '@/features/search/model/submitted-search';
import { runHooks } from '@/interop/hooks';
import { createLegacySearchStoreGlobals } from '@/interop/legacy-store-adapters/search';
import { installLegacyStoreGlobals } from '@/interop/window-globals';
import { queryHistoryDetails, queryHistoryFromUrl } from '@/url/query-history';
import { createSearchUrlBinding } from '@/url/search-state';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Translate } from '@/shared/i18n';

type SearchFeatureDependencies = {
	router: Router;
	corpusState: Pick<ReturnType<typeof createCorpusContext>, 'corpus' | 'tagset' | 'contextLoader' | 'beforePublish'>;
	blacklabApi: BlackLabApi;
	customizations: Customizations;
	translate: Translate;
	debug: MaybeRefOrGetter<boolean>;
};

/** Install once for an application when its first search route is opened. */
export function createSearchFeature({ router, corpusState, blacklabApi, customizations, translate, debug }: SearchFeatureDependencies) {
	const submittedSearch = createSubmittedSearch();
	const searchStore = createSearchStore(submittedSearch);
	ViewStore.setPageSizePreference(() => GlobalResultsStore.getState().pageSize);
	HistoryStore.setUrlDecoder(queryHistoryDetails);

	// Legacy stores must be synchronized before scripts observe the new corpus.
	corpusState.beforePublish(searchStore.init);
	// Search may first load after corpus scripts have configured the shared stores; initialize only search state here.
	if (corpusState.contextLoader.isLoaded()) searchStore.init(corpusState.contextLoader.value);

	const activeSearch = createActiveSearch(ViewStore.getSelectedViewName, {
		corpus: corpusState.corpus,
		submitted: submittedSearch,
		global: GlobalResultsStore.getState,
		getView: ViewStore.getOrCreateModule,
		withSpans: customizations.searchWithSpans,
		debug,
	});
	const searchFormSystem = createSearchFormSystem({ blacklabApi, corpus: corpusState.corpus, customizations, tagset: corpusState.tagset, translate });
	const contextSize = toRef(() => GlobalResultsStore.getState().context ?? DEFAULT_RESULT_CONTEXT_SIZE);
	const restoredForm = createSubmittedFormRestoration(submittedSearch, searchFormSystem.runtime);
	const searchSummary = createSearchSummary(submittedSearch, restoredForm);
	const formRestoration = createSearchFormRestoration({
		corpus: corpusState.corpus,
		runtime: searchFormSystem.runtime,
		submitted: submittedSearch,
		restoredForm,
		beforeStateLoaded: () => runHooks('beforeStateLoaded'),
	});
	const searchNavigation = createSearchUrlBinding(router, {
		corpus: corpusState.corpus,
		submittedSearch,
		restoreForms: formRestoration.restore,
		summary: searchSummary,
	});

	return {
		initialReadSettled: searchNavigation.initialReadSettled,
		activeSearchParameters: activeSearch.parameters,
		install(app: App) {
			HistoryStore.provideHistoryImport(app, async url => {
				if (!corpusState.corpus.value) return;
				await HistoryStore.actions.importUrl(url, url => queryHistoryFromUrl(url, searchFormSystem.runtime.value));
			});
			app.use(searchFormSystem);
			provideSearchActions(app, searchStore.actions);
			provideActiveSearch(app, activeSearch);
			provideResultContextSize(app, contextSize);
			provideSearchSummary(app, searchSummary);
			app.use(formRestoration);
			app.use(searchNavigation);
			installLegacyStoreGlobals(createLegacySearchStoreGlobals(activeSearch.parameters, searchStore));
			app.onUnmount(startSelectedSubcorpusEffect(() => (router.currentRoute.value.name === 'search' ? corpusState.corpus.value : undefined), blacklabApi, activeSearch.parameters));
		},
	};
}
