import cloneDeep from 'clone-deep';

import * as UIModule from '@/app/state/ui-state';
import { type CorpusContext } from '@/app/state/useCorpusContext';
import { getValueFunctions } from '@/components/filters/filterValueFunctions';
// Results
// Article
import * as ArticleModule from '@/features/article/model/article-state';
import * as TagsetModule from '@/features/corpus/model/tagset-state';
import type { CompiledFormStateWithSummaries, ResultPreset } from '@/features/form';
import * as HistoryModule from '@/features/history/model/query-history-state';
// Form
import * as ExploreModule from '@/features/search/model/form/explore-state';
import * as FilterModule from '@/features/search/model/form/filter-state';
import * as FormManager from '@/features/search/model/form/form-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';
import { memoize } from '@/features/search/model/form/reactive-store';
import * as QueryModule from '@/features/search/model/query-state';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import type * as BLTypes from '@/types/blacklabtypes';
import { corpusCustomizations } from '@/utils/customization';

import { getPatternString, getWithinClausesFromFilters } from '@/shared/blacklab-helpers/pattern-utils';
import debug, { debugLog } from '@/shared/debug/debug';

let localSearchIntentRevision = 0;

let context: CorpusContext | null = null;
const useCorpus = () => context?.index;

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

	blacklabParameters: memoize((): BLTypes.BLSearchParameters | undefined => {
		const activeView = get.viewedResultsSettings();
		if (!activeView || !QueryModule.getState().form) return undefined;
		if (GlobalResultsModule.getState().sampleSize && GlobalResultsModule.getState().sampleSeed == null) {
			throw new Error('Should provide a sampleSeed when random sampling, or every new page of results will use a different seed');
		}

		const debugParams = debug.value
			? {
					explain: true,
					outputformat: 'json',
				}
			: {};

		const pageSize = GlobalResultsModule.getState().pageSize;
		const lowerPageBoundary = Math.floor(activeView.first / pageSize) * pageSize;
		const numberOfResults = Math.ceil((activeView.first + activeView.number - lowerPageBoundary) / pageSize) * pageSize;

		const globalState = GlobalResultsModule.getState();
		const patt = QueryModule.get.patternString();
		const queryState = QueryModule.getState();
		const queryNeedsSpans =
			queryState.form === 'new'
				? queryState.state.resultPreset?.withSpans
				: queryState.form === 'search'
					? Object.values(queryState.filters).some(filter => getValueFunctions(filter).isSpanFilter)
					: undefined;
		return {
			...debugParams,

			first: lowerPageBoundary,
			number: numberOfResults,

			filter: QueryModule.get.filterString(),
			// I think we could omit searchfield in the blacklab parameters, as it should default to field,
			// but prefer to be explicit so everything is easy to reason about and all data is present everywhere and can be used to inform the UI etc.
			field: QueryModule.get.sourceField(),
			searchfield: QueryModule.get.sourceField(),
			patt,
			pattgapdata: QueryModule.get.pattGap(),

			sample: globalState.sampleMode === 'percentage' && globalState.sampleSize ? globalState.sampleSize : undefined,
			samplenum: globalState.sampleMode === 'count' && globalState.sampleSize ? globalState.sampleSize : undefined,
			sampleseed: globalState.sampleSize != null ? globalState.sampleSeed! : undefined,

			sort: activeView.sort != null ? activeView.sort : undefined,
			group: activeView.groupBy.join(','),
			viewgroup: activeView.viewGroup != null ? activeView.viewGroup : undefined,
			context: globalState.context != null ? globalState.context : undefined,
			adjusthits: true,
			withspans: patt ? (corpusCustomizations.search.pattern.shouldAddWithSpans(patt) ?? (queryNeedsSpans || !!useCorpus()?.hasRelations || undefined)) : undefined,
		};
	}),
	localSearchIntentRevision: () => localSearchIntentRevision,
};

/** Get the query that would be submitted if the user were to press submit right now.
 * Requires the new form system's compiled state as argument because the store can't access it directly (the new form's state is outside the store singleton) */
function getNextQueryState(newFormState?: CompiledFormStateWithSummaries | null): QueryModule.ModuleRootState {
	if (newFormState)
		return {
			form: 'new',
			state: newFormState,
		};

	const sharedState = {
		filters: get.filtersActive() ? cloneDeep(FilterModule.get.activeFiltersMap()) : {},
		shared: cloneDeep(PatternModule.get.shared()) as PatternModule.ModuleRootState['shared'],
		gap: get.gapFillingActive() ? GapModule.getState() : GapModule.defaults,
	};
	const activeForm = InterfaceModule.get.form();
	if (activeForm === 'explore') {
		const base = { ...sharedState, form: 'explore' as const };

		const exploreMode = InterfaceModule.get.exploreMode();
		if (exploreMode === 'corpora')
			return {
				...base,
				subForm: 'corpora',
				formState: cloneDeep(ExploreModule.getState().corpora),
			};
		else if (exploreMode === 'frequency')
			return {
				...base,
				subForm: 'frequency',
				formState: cloneDeep(ExploreModule.getState().frequency),
			};
		else if (exploreMode === 'ngram')
			return {
				...base,
				subForm: 'ngram',
				formState: cloneDeep(ExploreModule.getState().ngram),
			};
		else throw new Error(`Unhandled explore mode ${exploreMode as any} while restoring submitted query`);
	} else if (activeForm === 'search') {
		const patternMode = InterfaceModule.get.patternMode();
		const base = { ...sharedState, form: 'search' as const };
		if (patternMode === 'simple')
			return {
				...base,
				subForm: 'simple',
				formState: cloneDeep(PatternModule.getState().simple),
			};
		else if (patternMode === 'advanced')
			return {
				...base,
				subForm: 'advanced',
				formState: cloneDeep(PatternModule.getState().advanced),
			};
		else if (patternMode === 'expert')
			return {
				...base,
				subForm: 'expert',
				formState: cloneDeep(PatternModule.getState().expert),
			};
		else if (patternMode === 'extended')
			return {
				...base,
				subForm: 'extended',
				formState: cloneDeep(PatternModule.getState().extended),
			};
		else throw new Error(`Unhandled pattern mode ${patternMode as any} while restoring submitted query`);
	} else throw new Error(`Unhandled form ${activeForm as any} while restoring submitted query`);
}

function applyResultPreset(viewedResults: string, preset?: ResultPreset): void {
	if (!preset) return;
	const view = ViewModule.getOrCreateModule(viewedResults);
	if (preset.groupBy !== undefined) view.actions.groupBy(preset.groupBy);
	if (preset.groupDisplayMode !== undefined) view.actions.groupDisplayMode(preset.groupDisplayMode);
	// groupBy clears the sort, so an explicit preset sort must be applied last.
	if (preset.sort !== undefined) view.actions.sort(preset.sort);
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
	searchFromSubmit: (snapshot?: CompiledFormStateWithSummaries | null) => {
		localSearchIntentRevision += 1;
		if (!snapshot && InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'extended' && PatternModule.getState().extended.splitBatch) {
			actions.searchSplitBatches();
			return;
		}

		const newQueryState = getNextQueryState(snapshot);
		ViewModule.actions.resetAllViews({ resetGroupBy: false });

		QueryModule.actions.search(newQueryState);
		if (!snapshot && applyLegacyExploreResultSettings()) return;

		const newPattern = QueryModule.get.patternString();
		const currentView = InterfaceModule.get.viewedResults();
		const viewedResults = snapshot?.resultPreset?.viewedResults ?? (!newPattern ? 'docs' : (currentView ?? 'hits'));
		InterfaceModule.actions.viewedResults(viewedResults);
		applyResultPreset(viewedResults, snapshot?.resultPreset);
	},

	searchSplitBatches: () => {
		if (InterfaceModule.get.form() !== 'search' || InterfaceModule.get.patternMode() !== 'extended' || !PatternModule.getState().extended.splitBatch) {
			throw new Error('Attempting to submit split batches in wrong view');
		}

		InterfaceModule.actions.viewedResults('hits');
		const sharedBatchState: Omit<HistoryModule.HistoryEntry, 'patterns'> = {
			view: ViewModule.getOrCreateModule(InterfaceModule.getState().viewedResults!).getState(),
			explore: ExploreModule.defaults,
			global: GlobalResultsModule.getState(),
			interface: InterfaceModule.getState(),
			filters: get.filtersActive() ? FilterModule.get.activeFiltersMap() : {},
			gap: get.gapFillingActive() ? GapModule.getState() : GapModule.defaults,
		};

		const annotations = PatternModule.get.activeAnnotations();
		const [withinClauses] = getWithinClausesFromFilters(FilterModule.getState().filters, PatternModule.getState());
		const submittedFormStates = annotations
			.filter(a => a.type !== 'pos')
			.flatMap(a => a.value.split('|').map(value => ({ ...a, value })))
			.map<HistoryModule.HistoryEntryPatternAndUrl>(a => ({
				entry: {
					...sharedBatchState,
					patterns: {
						advanced: { query: { tokens: [], within: '', withinAttributes: {} }, targetQueries: [] },
						expert: {
							query: null,
							targetQueries: [],
						},
						shared: PatternModule.getState().shared,
						simple: PatternModule.getState().simple,
						extended: {
							annotationValues: {
								[a.id]: a,
							},
							splitBatch: false,
						},
					},
				},
				pattern: getPatternString([a], withinClauses, PatternModule.getState().shared.targets, PatternModule.getState().shared.alignBy || UIModule.getState().search.shared.alignBy.defaultValue),
				url: '',
			}))
			.map(v => cloneDeep(v));

		submittedFormStates.forEach(HistoryModule.actions.addEntry);
		const mostRecent = HistoryModule.getState()[0];
		if (mostRecent) {
			actions.replace(mostRecent);
		}
	},

	reset: () => {
		localSearchIntentRevision += 1;
		FormManager.actions.reset();
		ViewModule.actions.resetAllViews({ resetGroupBy: true });
		QueryModule.actions.reset();
	},

	replace: (payload: HistoryModule.HistoryEntry) => {
		FormManager.actions.replace(payload);
		GlobalResultsModule.actions.replace(payload.global);
		ViewModule.actions.resetAllViews({ resetGroupBy: true });
		if (payload.interface.viewedResults != null) {
			const viewName = payload.interface.viewedResults;
			ViewModule.actions.replaceView({ view: viewName, data: payload.view });

			const pageSize = GlobalResultsModule.getState().pageSize;
			const lowerPageBoundary = Math.floor(payload.view.first / pageSize) * pageSize;
			const numberOfResults = Math.ceil((payload.view.first + payload.view.number - lowerPageBoundary) / pageSize) * pageSize;
			const rangeNeedsExpansion = lowerPageBoundary !== payload.view.first || numberOfResults !== payload.view.number;

			const restoredView = ViewModule.getOrCreateModule(viewName);
			if (rangeNeedsExpansion) {
				restoredView.actions.setRequestedRange({
					first: payload.view.first,
					number: payload.view.number,
				});
			} else {
				restoredView.actions.clearRequestedRange();
			}
		}

		if (payload.interface.viewedResults != null) {
			QueryModule.actions.search(getNextQueryState(payload.newForm));
		} else {
			QueryModule.actions.reset();
		}
	},
};

const init = (state: CorpusContext) => {
	debugLog('store', 'Initializing store with new corpus data', state);
	context = state;

	UIModule.init(state);

	FormManager.init(state);
	ViewModule.init(state);
	GlobalResultsModule.init(state);

	TagsetModule.init(state);
	HistoryModule.init(state);
	QueryModule.init(state);

	ArticleModule.init(state);
};

export { actions, get, init };
