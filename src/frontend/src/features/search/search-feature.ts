import { useLocalStorage } from '@vueuse/core';
import { toRef, type App, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Router } from 'vue-router';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { Customizations } from '@/customization-api/internal/internal-api';
import * as HistoryStore from '@/features/history/model/query-history-state';
import { createSearchFormBinding } from '@/features/search/bindings/search-form';
import { startSelectedSubcorpusEffect } from '@/features/search/effects/selected-subcorpus.effect';
import { createSearchFormSystem } from '@/features/search/model/new-form/search-form-system';
import { DEFAULT_RESULT_CONTEXT_SIZE, provideResultContextSize } from '@/features/search/model/results/result-context-size';
import { ResultsState, defaults, provideResultsState } from '@/features/search/model/results/results-state';
import { provideSearchSummary } from '@/features/search/model/search-summary';
import { createSubmittedSearch } from '@/features/search/model/submitted-search';
import { runHooks } from '@/interop/hooks';
import { createLegacySearchStoreGlobals } from '@/interop/legacy-store-adapters/search';
import { installLegacyStoreGlobals } from '@/interop/window-globals';
import type { Corpus, Tagset } from '@/types/apptypes';
import { createSearchUrlBinding } from '@/url/search-state';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Translate } from '@/shared/i18n';
import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';

type SearchFeatureDependencies = {
	customizationsReady: MaybeRefOrGetter<boolean>;
	router: Router;
	corpusState: {
		corpus: Ref<Corpus | undefined>;
		tagset: Ref<Tagset | undefined>;
		contextLoader: LoadableFromRequest<CorpusContext>;
		beforePublish(callback: (context: CorpusContext) => void): void;
	};
	blacklabApi: BlackLabApi;
	customizations: Customizations;
	translate: Translate;
	debug: MaybeRefOrGetter<boolean>;
};

/** Install once for an application when its first search route is opened. */
export function createSearchFeature({ router, customizationsReady, corpusState, blacklabApi, customizations, translate, debug }: SearchFeatureDependencies) {
	const submittedSearch = createSubmittedSearch();
	const pageSize = useLocalStorage('cf/pageSize', defaults.pageSize);
	const results = new ResultsState({ corpus: corpusState.corpus, submitted: submittedSearch.current, withSpans: customizations.searchWithSpans, debug }, pageSize);

	function initializeCorpus(context: CorpusContext) {
		submittedSearch.reset();
		results.reset();
		HistoryStore.init(context);
	}
	corpusState.beforePublish(initializeCorpus);
	if (corpusState.contextLoader.isLoaded()) initializeCorpus(corpusState.contextLoader.value);

	const searchFormSystem = createSearchFormSystem({ blacklabApi, corpus: corpusState.corpus, customizations, tagset: corpusState.tagset, translate });
	const contextSize = toRef(() => results.settings.context ?? DEFAULT_RESULT_CONTEXT_SIZE);
	const form = createSearchFormBinding({
		customizationsReady,
		beforeStateLoaded: () => runHooks('beforeStateLoaded'),
		results,
		corpus: corpusState.corpus,
		runtime: searchFormSystem.runtime,
		submitted: submittedSearch,
	});
	const searchNavigation = createSearchUrlBinding(router, {
		corpus: corpusState.corpus,
		search: submittedSearch,
		results,
		form,
		history: HistoryStore.actions,
	});

	return {
		results,
		initialReadSettled: searchNavigation.initialReadSettled,
		install(app: App) {
			HistoryStore.provideHistoryImport(app, async url => HistoryStore.importSearchUrl(url, searchFormSystem.runtime.value));
			app.use(searchFormSystem);
			provideResultsState(app, results);
			provideResultContextSize(app, contextSize);
			provideSearchSummary(app, form.summary);
			app.use(form);
			app.use(searchNavigation);
			installLegacyStoreGlobals(createLegacySearchStoreGlobals(results, form, initializeCorpus));
			app.onUnmount(startSelectedSubcorpusEffect(() => (router.currentRoute.value.name === 'search' ? corpusState.corpus.value : undefined), blacklabApi, results.parameters));
		},
	};
}
