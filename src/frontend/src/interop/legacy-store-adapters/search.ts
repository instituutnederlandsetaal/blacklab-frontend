import * as ArticleModule from '@/app/state/article-configuration';
import * as HistoryModule from '@/features/history/model/query-history-state';
import type { ActiveSearchParameters } from '@/features/search/model/active-search';
import * as ExploreModule from '@/features/search/model/form/explore-state';
import * as FormManager from '@/features/search/model/form/form-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import * as RootStore from '@/features/search/model/search-store';

/** Add search compatibility methods while retaining the shared article configuration under root. */
export function createLegacySearchStoreGlobals(activeSearchParameters: ActiveSearchParameters) {
	const vuexModules = {
		root: {
			get: {
				...RootStore.get,
				blacklabParameters: () => activeSearchParameters.value,
				...ArticleModule.get,
			},
			getState: ArticleModule.getState,
			actions: {
				...RootStore.actions,
				/** Compatibility for scripts that used to wrap store actions in a navigation command. */
				navigateSearch: async (change: () => unknown) => {
					change();
				},
				...ArticleModule.actions,
			},
			init: RootStore.init,
		},
		history: HistoryModule,
		explore: ExploreModule,
		form: FormManager,
		interface: InterfaceModule,
		patterns: PatternModule,
		gap: GapModule,
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
