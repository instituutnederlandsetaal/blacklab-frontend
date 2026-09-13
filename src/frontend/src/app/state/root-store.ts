import * as UIModule from '@/app/state/ui-state';
import { type CorpusContext } from '@/app/state/useCorpusContext';
import { getFilterString, getValueFunctions } from '@/components/filters/filterValueFunctions';
import type { Customizations } from '@/customization-api/internal/internal-api';
import * as ArticleModule from '@/features/article/model/article-state';
import * as TagsetModule from '@/features/corpus/model/tagset-state';
import { type CompiledFormResult } from '@/features/form';
import * as HistoryModule from '@/features/history/model/query-history-state';
import * as ExploreModule from '@/features/search/model/form/explore-state';
import * as FilterModule from '@/features/search/model/form/filter-state';
import * as FormManager from '@/features/search/model/form/form-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';
import { handoffCompiledForm } from '@/features/search/model/new-form/form-state-bridge';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import { summarizeLegacySearch } from '@/features/search/model/search-summary';
import { submittedSearchFromResult, type SubmittedSearchState } from '@/features/search/model/submitted-search';
import type { BLSearchParameters } from '@/types/blacklabtypes';

import { debugLog } from '@/shared/debug/debug';
import { getPatternStringSearch, getPatternStringExplore } from '@/shared/blacklab-helpers/pattern-utils';

type SearchPageState = FormManager.ModuleRootState & {
	global: GlobalResultsModule.ExternalModuleRootState;
	view: ViewModule.ViewRootState;
};

let submittedSearch: SubmittedSearchState;
const setSubmittedSearch = (value: SubmittedSearchState) => {
	submittedSearch = value;
};

let context: CorpusContext | null = null;
let customizations: Customizations | undefined;

const get = {
	viewedResultsSettings: () => {
		const viewName = InterfaceModule.get.viewedResults();
		return viewName ? ViewModule.getOrCreateModule(viewName).getState() : null;
	},

	filtersActive: () => {
		return !(InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'simple');
	},
	gapFillingActive: () => {
		return InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'expert';
	},
	queryBuilderActive: () => {
		return InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'advanced';
	},
};

/** Compile the legacy draft only when it is submitted. */
function compileLegacyQuery() {
	const ui = InterfaceModule.getState();
	const filters = get.filtersActive() ? FilterModule.get.activeFiltersMap() : {};
	const patt =
		ui.form === 'search'
			? getPatternStringSearch(ui.patternMode, PatternModule.getState(), customizations?.searchFormAlignByDefault() ?? '', filters)
			: getPatternStringExplore(ui.exploreMode, ExploreModule.getState(), context?.index?.allAnnotationsMap ?? {});
	return {
		params: {
			patt,
			filter: getFilterString(Object.values(filters).sort((a, b) => a.id.localeCompare(b.id))),
			searchfield: PatternModule.get.shared().source ?? undefined,
			pattgapdata: get.gapFillingActive() ? (GapModule.getState().value ?? undefined) : undefined,
			withspans: Object.values(filters).some(filter => getValueFunctions(filter).isSpanFilter) || undefined,
		} satisfies Partial<BLSearchParameters>,
		interface: { ...ui },
		summary: summarizeLegacySearch({ interface: ui, explore: ExploreModule.getState(), filters }, patt, context?.index?.allAnnotationsMap ?? {}),
	};
}

function applyLegacyExploreResultSettings(): boolean {
	if (InterfaceModule.get.form() !== 'explore') return false;
	switch (InterfaceModule.get.exploreMode()) {
		case 'corpora': {
			const groupBy = ExploreModule.get.corpora.groupBy();
			InterfaceModule.actions.viewedResults('docs');
			const view = ViewModule.getOrCreateModule('docs');
			view.actions.groupDisplayMode(ExploreModule.get.corpora.groupDisplayMode());
			view.actions.groupBy(groupBy ? [groupBy] : []);
			return true;
		}
		case 'frequency': {
			InterfaceModule.actions.viewedResults('hits');
			ViewModule.getOrCreateModule('hits').actions.groupBy([ExploreModule.get.frequency.groupBy()]);
			return true;
		}
		case 'ngram': {
			InterfaceModule.actions.viewedResults('hits');
			ViewModule.getOrCreateModule('hits').actions.groupBy([ExploreModule.get.ngram.groupBy()]);
			return true;
		}
	}
}

const actions = {
	/** New forms supply their compiled draft; legacy forms still use the stores. */
	searchFromSubmit: (snapshot?: CompiledFormResult) => {
		if (snapshot) {
			handoffCompiledForm(snapshot);
			submittedSearch.value = submittedSearchFromResult(snapshot);
			return snapshot;
		}

		const query = compileLegacyQuery();
		ViewModule.actions.resetAllViews({ resetGroupBy: false });

		if (!applyLegacyExploreResultSettings()) {
			InterfaceModule.actions.viewedResults(query.params.patt ? (InterfaceModule.get.viewedResults() ?? 'hits') : 'docs');
		}
		submittedSearch.value = submittedSearchFromResult(query);
		return query;
	},

	reset: () => {
		submittedSearch.value = undefined;
		FormManager.actions.reset();
		ViewModule.actions.resetAllViews({ resetGroupBy: true });
	},

	replace: (payload: SearchPageState) => {
		FormManager.actions.replace(payload);
		GlobalResultsModule.actions.replace(payload.global);
		ViewModule.actions.resetAllViews({ resetGroupBy: true });
		const view = payload.interface.viewedResults;
		if (view != null) ViewModule.actions.replaceView({ view, data: payload.view });
		submittedSearch.value = view ? submittedSearchFromResult(compileLegacyQuery()) : undefined;
	},
};

const setCustomizations = (value: Customizations) => {
	customizations = value;
};

const init = (state: CorpusContext) => {
	debugLog('store', 'Initializing store with new corpus data', state);
	context = state;
	submittedSearch.value = undefined;

	UIModule.init(state);

	if (!customizations) throw new Error('Root store initialized without customizations.');
	FormManager.init(state, customizations);
	ViewModule.init(state);
	GlobalResultsModule.init(state);

	TagsetModule.init(state);
	HistoryModule.init(state);

	ArticleModule.init(state);
};

export { actions, get, init, setCustomizations, setSubmittedSearch };
