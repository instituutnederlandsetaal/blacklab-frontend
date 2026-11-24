import { useLocalStorage } from '@vueuse/core';
import { toRef, type App, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Router } from 'vue-router';

import type { Customizations } from '@/customization-api/internal/internal-api';
import type { CorpusContext } from '@/features/corpus/corpus-context';
import { runHooks } from '@/interop/hooks';
import { createLegacySearchStoreGlobals } from '@/interop/legacy-store-adapters/search';
import { installLegacyStoreGlobals } from '@/interop/window-globals';
import { createSearchFormBinding } from '@/pages/search/bindings/search-form-binding';
import { createSearchUrlBinding } from '@/pages/search/bindings/search-url-binding';
import * as HistoryStore from '@/pages/search/history/query-history-store';
import { createSearchFormSystem } from '@/pages/search/model/form/search-form-system';
import { DEFAULT_RESULT_CONTEXT_SIZE, provideResultContextSize } from '@/pages/search/model/results/result-context-size-injection';
import { ResultsState, defaults, provideResultsState } from '@/pages/search/model/results/results-state';
import { provideSearchSummary } from '@/pages/search/model/search-summary';
import { createSubmittedSearch } from '@/pages/search/model/submitted-search';
import type { Corpus, Tagset } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Translate } from '@/shared/i18n';
import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';

type SearchPluginDependencies = {
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
export function createSearchPlugin({ router, customizationsReady, corpusState, blacklabApi, customizations, translate, debug }: SearchPluginDependencies) {
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
	const urlBinding = createSearchUrlBinding(router, {
		corpus: corpusState.corpus,
		search: submittedSearch,
		results,
		form,
		onResultsUrl(url) {
			const { pattern, filter } = form.summary.value;
			HistoryStore.actions.addEntry({ url, displayValues: { pattern: pattern ?? '', filters: filter ?? '' } });
		},
	});

	return {
		results,
		initialReadSettled: urlBinding.initialReadSettled,
		install(app: App) {
			app.use(searchFormSystem);
			provideResultsState(app, results);
			provideResultContextSize(app, contextSize);
			provideSearchSummary(app, form.summary);
			app.use(form);
			app.use(urlBinding);
			installLegacyStoreGlobals(createLegacySearchStoreGlobals(results, form, initializeCorpus));
		},
	};
}
