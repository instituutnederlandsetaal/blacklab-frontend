import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { CompiledFormResult } from '@/features/form';
import * as HistoryModule from '@/features/history/model/query-history-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import { submittedSearchFromResult, type SubmittedSearchState } from '@/features/search/model/submitted-search';

import { debugLog } from '@/shared/debug/debug';
import useInjectable from '@/shared/utils/useInjectable';

export const [, provideSearchActions, useSearchActions] = useInjectable<ReturnType<typeof createSearchStore>['actions']>('search-actions');

export const get = {
	viewedResultsSettings: () => {
		const viewName = InterfaceModule.get.viewedResults();
		return viewName ? ViewModule.getOrCreateModule(viewName).getState() : null;
	},
};

export function createSearchStore(submittedSearch: SubmittedSearchState) {
	return {
		actions: {
			searchFromSubmit(snapshot: CompiledFormResult) {
				const { params, targetView, resultPreset } = snapshot;
				const viewName = params.colltype !== undefined ? 'hits' : (targetView ?? (params.patt ? 'hits' : 'docs'));
				const pageSize = GlobalResultsModule.getState().pageSize;
				ViewModule.forEachView(view => {
					view.first = 0;
					view.number = pageSize;
					view.viewGroup = null;
				});
				InterfaceModule.actions.viewedResults(viewName);
				const view = ViewModule.getOrCreateModule(viewName);
				if (params.colltype !== undefined) {
					view.actions.groupBy([]);
					view.actions.collocationScorer(params.scorertype);
					view.actions.sort(params.sort ?? 'score');
				} else {
					if (Object.hasOwn(params, 'group')) {
						const previousSort = view.getState().sort;
						view.actions.groupBy(params.group ? params.group.split(',') : []);
						if (!Object.hasOwn(params, 'sort')) view.actions.sort(previousSort);
					}
					if (Object.hasOwn(params, 'sort')) view.actions.sort(params.sort ?? null);
				}
				if (resultPreset !== undefined) view.actions.groupDisplayMode(resultPreset);
				submittedSearch.value = submittedSearchFromResult(snapshot);
				return snapshot;
			},
			reset() {
				submittedSearch.value = undefined;
				InterfaceModule.actions.viewedResults(null);
				ViewModule.actions.resetAllViews({ resetGroupBy: true });
			},
		},
		init(state: CorpusContext) {
			debugLog('store', 'Initializing search stores with new corpus data', state);
			submittedSearch.value = undefined;
			InterfaceModule.actions.viewedResults(null);
			ViewModule.init(state);
			GlobalResultsModule.init(state);
			HistoryModule.init(state);
		},
	};
}
