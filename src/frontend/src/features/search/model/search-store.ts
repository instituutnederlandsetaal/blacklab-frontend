import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { CompiledFormResult } from '@/features/form';
import * as HistoryModule from '@/features/history/model/query-history-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import { handoffCompiledForm } from '@/features/search/model/new-form/form-state-bridge';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import { submittedSearchFromResult, type SubmittedSearchState } from '@/features/search/model/submitted-search';

import { debugLog } from '@/shared/debug/debug';

let submittedSearch: SubmittedSearchState;
const setSubmittedSearch = (value: SubmittedSearchState) => {
	submittedSearch = value;
};

const get = {
	viewedResultsSettings: () => {
		const viewName = InterfaceModule.get.viewedResults();
		return viewName ? ViewModule.getOrCreateModule(viewName).getState() : null;
	},
};

const actions = {
	searchFromSubmit: (snapshot: CompiledFormResult) => {
		handoffCompiledForm(snapshot);
		submittedSearch.value = submittedSearchFromResult(snapshot);
		return snapshot;
	},

	reset: () => {
		submittedSearch.value = undefined;
		InterfaceModule.actions.viewedResults(null);
		ViewModule.actions.resetAllViews({ resetGroupBy: true });
	},
};

const init = (state: CorpusContext) => {
	debugLog('store', 'Initializing search stores with new corpus data', state);
	submittedSearch.value = undefined;
	InterfaceModule.actions.viewedResults(null);
	ViewModule.init(state);
	GlobalResultsModule.init(state);
	HistoryModule.init(state);
};

export { actions, get, init, setSubmittedSearch };
