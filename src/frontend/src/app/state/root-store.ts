import cloneDeep from 'clone-deep';

import * as UIModule from '@/app/state/ui-state';
import * as CorpusModule from '@/features/corpus/model/corpus-state';
import * as TagsetModule from '@/features/corpus/model/tagset-state';
import * as HistoryModule from '@/features/history/model/query-history-state';
import * as QueryModule from '@/features/search/model/query-state';

// Form
import * as ExploreModule from '@/features/search/model/form/explore-state';
import * as FilterModule from '@/features/search/model/form/filter-state';
import * as FormManager from '@/features/search/model/form/form-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';

// Results
// Article
import * as ArticleModule from '@/features/article/model/article-state';

import { corpusDataLoader } from '@/api/async/instances/corpus-data';
import type { CorpusChange } from '@/api/async/logic/corpus/corpus-data-from-id';
import type * as BLTypes from '@/types/blacklabtypes';
import { corpusCustomizations } from '@/utils/customization';
import debug from '@/utils/debug';
import { Loadable } from '@/utils/loadable-streams';
import { getPatternString, getWithinClausesFromFilters } from '@/utils/pattern-utils';
import { shallowRef } from 'vue';

// separate, because while the corpusloader might have settled, store init is async
// and we don't want to report being done while submodules are still initializing
// (We should solve this better in the future)
const loadingState = shallowRef<Loadable<CorpusChange>>(Loadable.Empty());

const get = {
	loadingState: () => loadingState,

	viewedResultsSettings: () => {
		const viewName = InterfaceModule.get.viewedResults();
		return viewName ? ViewModule.getOrCreateModule(viewName).getState() : null;
	},

	filtersActive: () => {
		return !(InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'simple');
	},
	gapFillingActive: () => {
		return (InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'expert');
	},
	queryBuilderActive: () => {
		return InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'advanced';
	},

	blacklabParameters: (): BLTypes.BLSearchParameters|undefined => {
		const activeView = get.viewedResultsSettings();
		if (!activeView || !QueryModule.getState().form) return undefined;
		if (GlobalResultsModule.getState().sampleSize && GlobalResultsModule.getState().sampleSeed == null) {
			throw new Error('Should provide a sampleSeed when random sampling, or every new page of results will use a different seed');
		}

		const patt = QueryModule.get.patternString() ?? '';

		const debugParams = debug.value ? {
			explain: true,
			outputformat: 'json',
		} : {};

		const pageSize = GlobalResultsModule.getState().pageSize;
		const lowerPageBoundary = Math.floor(activeView.first / pageSize) * pageSize;
		const numberOfResults = Math.ceil((activeView.first + activeView.number - lowerPageBoundary) / pageSize) * pageSize;

		const globalState = GlobalResultsModule.getState();
		return {
			...debugParams,

			first: lowerPageBoundary,
			number: numberOfResults,

			filter: QueryModule.get.filterString(),
			field: QueryModule.get.sourceField().id,
			patt,
			pattgapdata: (QueryModule.get.patternString() && QueryModule.getState().gap) ? QueryModule.getState().gap!.value || undefined : undefined,

			sample: (globalState.sampleMode === 'percentage' && globalState.sampleSize) ? globalState.sampleSize : undefined,
			samplenum: (globalState.sampleMode === 'count' && globalState.sampleSize) ? globalState.sampleSize : undefined,
			sampleseed: globalState.sampleSize != null ? globalState.sampleSeed! : undefined,

			sort: activeView.sort != null ? activeView.sort : undefined,
			group: activeView.groupBy.join(','),
			viewgroup: activeView.viewGroup != null ? activeView.viewGroup : undefined,
			context: globalState.context != null ? globalState.context : undefined,
			adjusthits: true,
			withspans: corpusCustomizations.search.pattern.shouldAddWithSpans(patt) ??
				(FilterModule.get.hasSpanFilters() || CorpusModule.get.hasRelations()),
		};
	}
};

const actions = {
	retryLoading: () => corpusDataLoader.retry(),

	searchFromSubmit: () => {
		if (InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'extended' && PatternModule.getState().extended.splitBatch) {
			actions.searchSplitBatches();
			return;
		}
		ViewModule.actions.resetAllViews({resetGroupBy: false});

		if (InterfaceModule.get.form() === 'explore') {
			switch (InterfaceModule.get.exploreMode()) {
				case 'corpora': {
					InterfaceModule.actions.viewedResults('docs');
					const m = ViewModule.getOrCreateModule('docs');
					m.actions.groupDisplayMode(ExploreModule.getState().corpora.groupDisplayMode);
					m.actions.groupBy(ExploreModule.getState().corpora.groupBy ? [ExploreModule.getState().corpora.groupBy] : []);
					break;
				}
				case 'frequency':
				case 'ngram': {
					InterfaceModule.actions.viewedResults('hits');
					const m = ViewModule.getOrCreateModule('hits');
					m.actions.groupBy(InterfaceModule.get.exploreMode() === 'ngram' ? [ExploreModule.get.ngram.groupBy()] : [ExploreModule.get.frequency.groupBy()]);
					break;
				}
				default: throw new Error(`Unhandled explore mode ${InterfaceModule.get.exploreMode() as any} while submitting form`);
			}
		}

		const oldPattern = QueryModule.get.patternString();
		actions.searchAfterRestore();
		const newPattern = QueryModule.get.patternString();

		let newView = InterfaceModule.get.viewedResults();
		if (newView == null) {
			newView = newPattern ? 'hits' : 'docs';
		} else if (newView === 'hits' && !newPattern) {
			newView = 'docs';
		} else if (oldPattern == null && newPattern != null) {
			newView = 'hits';
		}

		InterfaceModule.actions.viewedResults(newView);
	},

	searchAfterRestore: () => {
		let submittedFormState: QueryModule.ModuleRootState;

		const activeForm = InterfaceModule.get.form();
		switch (activeForm) {
			case 'explore': {
				const exploreMode = InterfaceModule.get.exploreMode();
				submittedFormState = {
					form: activeForm,
					subForm: exploreMode,
					filters: get.filtersActive() ? cloneDeep(FilterModule.get.activeFiltersMap()) as ReturnType<typeof FilterModule['get']['activeFiltersMap']> : {},
					formState: cloneDeep(ExploreModule.getState()[exploreMode]) as ExploreModule.ModuleRootState[typeof exploreMode],
					shared: cloneDeep(PatternModule.get.shared()) as PatternModule.ModuleRootState['shared'],
					gap: get.gapFillingActive() ? GapModule.getState() : GapModule.defaults,
				};
				break;
			}
			case 'search': {
				const patternMode = InterfaceModule.get.patternMode();
				submittedFormState = {
					form: activeForm,
					subForm: patternMode,
					filters: get.filtersActive() ? cloneDeep(FilterModule.get.activeFiltersMap()) as ReturnType<typeof FilterModule['get']['activeFiltersMap']> : {},
					formState: cloneDeep(PatternModule.getState()[patternMode]) as PatternModule.ModuleRootState[typeof patternMode],
					shared: cloneDeep(PatternModule.get.shared()) as PatternModule.ModuleRootState['shared'],
					gap: get.gapFillingActive() ? GapModule.getState() : GapModule.defaults,
				};
				break;
			}
			default: {
				throw new Error('Form ' + activeForm + ' cannot generate blacklab query; not implemented!');
			}
		}
		QueryModule.actions.search(submittedFormState);
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
		.flatMap(a => a.value.split('|').map(value => ({...a,value})))
		.map<HistoryModule.HistoryEntryPatternAndUrl>(a => ({
			entry: {
				...sharedBatchState,
				patterns: {
					advanced: { query: {tokens: [], within: '', withinAttributes: {}}, targetQueries: [] },
					expert: {
						query: null,
						targetQueries: [],
					},
					shared: PatternModule.getState().shared,
					simple: PatternModule.getState().simple,
					extended: {
						annotationValues: {
							[a.id]: a
						},
						splitBatch: false,
					}
				}
			},
			pattern: getPatternString([a], withinClauses,
				PatternModule.getState().shared.targets,
				PatternModule.getState().shared.alignBy || UIModule.getState().search.shared.alignBy.defaultValue),
			url: ''
		}))
		.map(v => cloneDeep(v));

		submittedFormStates.forEach(HistoryModule.actions.addEntry);
		const mostRecent = HistoryModule.getState()[0];
		if (mostRecent) {
			actions.replace(mostRecent);
		}
	},

	reset: () => {
		FormManager.actions.reset();
		ViewModule.actions.resetAllViews({resetGroupBy: true});
		QueryModule.actions.reset();
		ArticleModule.actions.reset();
	},

	replace: (payload: HistoryModule.HistoryEntry&{article?: ArticleModule.HistoryState} ) => {
		FormManager.actions.replace(payload);
		GlobalResultsModule.actions.replace(payload.global);
		ViewModule.actions.resetAllViews({resetGroupBy: true});
		if (payload.article) {
			ArticleModule.actions.replace(payload.article);
		}
		if (payload.interface.viewedResults != null) {
			const viewName = payload.interface.viewedResults;
			ViewModule.actions.replaceView({view: viewName, data: payload.view});

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
		if ((payload.article?.docId != null && payload.patterns.expert) || payload.interface.viewedResults != null ) {
			actions.searchAfterRestore();
		}
	},
};

const init = async (state: CorpusChange) => {
	loadingState.value = Loadable.Loading();
	console.log('Initializing store with new corpus data', state);
	await CorpusModule.init(state);
	await UIModule.init(state);

	await FormManager.init(state);
	await ViewModule.init(state);
	await GlobalResultsModule.init(state);

	await TagsetModule.init(state);
	await HistoryModule.init(state);
	await QueryModule.init(state);

	await ArticleModule.init(state);
	loadingState.value = Loadable.Loaded(state);
};

export { actions, get, init };
