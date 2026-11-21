import * as ArticleModule from '@/app/state/article-configuration';
import * as HistoryModule from '@/features/history/model/query-history-state';
import type { ActiveSearchParameters } from '@/features/search/model/active-search';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import { get as searchGetters, type createSearchStore } from '@/features/search/model/search-store';

/** Add search compatibility methods while retaining the shared article configuration under root. */
export function createLegacySearchStoreGlobals(activeSearchParameters: ActiveSearchParameters, searchStore: ReturnType<typeof createSearchStore>) {
	const vuexModules = {
		root: {
			get: {
				...searchGetters,
				blacklabParameters: () => activeSearchParameters.value,
				...ArticleModule.get,
			},
			getState: ArticleModule.getState,
			actions: {
				...searchStore.actions,
				/** Compatibility for scripts that used to wrap store actions in a navigation command. */
				navigateSearch: async (change: () => unknown) => {
					change();
				},
				...ArticleModule.actions,
			},
			init: searchStore.init,
		},
		history: HistoryModule,
		interface: InterfaceModule,
		views: ViewModule,
		results: {
			...ViewModule,
			get hits() {
				return ViewModule.getOrCreateModule('hits');
			},
			get docs() {
				return ViewModule.getOrCreateModule('docs');
			},
		},
		global: GlobalResultsModule,
	};

	return vuexModules;
}
