import Vue from 'vue';
import Vuex from 'vuex';

import cloneDeep from 'clone-deep';
import {getStoreBuilder} from 'vuex-typex';

import * as CorpusModule from '@/store/corpus';
import * as HistoryModule from '@/store/history';
import * as QueryModule from '@/store/query';
import * as TagsetModule from '@/store/tagset';
import * as UIModule from '@/store/ui';

// Form
import * as FormManager from '@/store/form';
import * as FilterModule from '@/store/form/filters';
import * as InterfaceModule from '@/store/form/interface';
import * as PatternModule from '@/store/form/patterns';
import * as ExploreModule from '@/store/form/explore';
import * as GapModule from '@/store/form/gap';
import * as GlossModule from '@/store/form/glossStore';
import * as ConceptModule from '@/store/form/conceptStore';

// Results
import * as ViewModule from '@/store/results/views';
import * as GlobalResultsModule from '@/store/results/global';

// Article
import * as ArticleModule from '@/store/article';

import * as BLTypes from '@/types/blacklabtypes';
import { getPatternString, getWithinClausesFromFilters } from '@/utils/pattern-utils';
import { Loadable, loadableFromObservable, loadableStreamFromPromise, mapLoaded } from '@/utils/loadable-streams';
import { concatMap, Observable, of, pairwise, shareReplay, startWith } from 'rxjs';
import debug, {  } from '@/utils/debug';

Vue.use(Vuex);
const loadingState$: Observable<Loadable<void>> = CorpusModule.index$.pipe(
	// To know when the corpus has changed, we need to compare the previous and current value.
	// We need a startWith to have a previous value to compare to, otherwise the first value will be ignored.
	startWith(Loadable.Empty<void>()),
	mapLoaded(v => undefined as void),
	pairwise(),
	// concatMap buffers all events, and waits for the inner observable to complete before moving on to the next value.
	// So essentially this prevents multiple concurrent calls to corpusChanged.
	concatMap(([prev, cur]) => {
		if (cur.value !== prev.value) {
			return loadableStreamFromPromise(privateActions.corpusChanged())
		}
		return of(cur);
	}),
	shareReplay(1),
)

type RootState = {
	/**
	 * After the corpus is loaded (or cleared), some further setup of the store needs to occur,
	 * and before the page can render properly.
	 * This loadable will only become loaded once that happens.
	 */
	storeLoadingState: Loadable<undefined>;
	corpus: CorpusModule.ModuleRootState;
	article: ArticleModule.ModuleRootState;

	history: HistoryModule.ModuleRootState;
	query: QueryModule.ModuleRootState;
	tagset: TagsetModule.ModuleRootState;
	ui: UIModule.ModuleRootState;
	views: ViewModule.ModuleRootState;
	global: GlobalResultsModule.ModuleRootState;
}&FormManager.PartialRootState;

const b = getStoreBuilder<RootState>();

const getState = b.state();

const get = {
	loadingState: b.read(s => s.storeLoadingState, 'loadingState'),

	viewedResultsSettings: b.read(state => state.views[state.interface.viewedResults!] ?? null, 'getViewedResultsSettings'),

	/** Whether the filters section should be active (as it isn't active when in specific search modes (e.g. simple or explore)) */
	filtersActive: b.read(state => {
		return !(InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'simple');
	}, 'filtersActive'),
	gapFillingActive: b.read(state => {
		return (InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'expert');
	}, 'gapFillingActive'),
	queryBuilderActive: b.read(state => {
		return InterfaceModule.get.form() === 'search' && InterfaceModule.get.patternMode() === 'advanced';
	}, 'queryBuilderActive'),

	blacklabParameters: b.read((state): BLTypes.BLSearchParameters|undefined => {
		const activeView = get.viewedResultsSettings();
		if (!activeView || !state.query) return undefined;
		if (state.global.sampleSize && state.global.sampleSeed == null) {
			throw new Error('Should provide a sampleSeed when random sampling, or every new page of results will use a different seed');
		}

		// These make debugging more convenient
		const debugParams = debug.debug ? {
			// Explain how the CQL was converted to a query and rewritten for optimization
			explain: true,
			// If you open a BLS request in a new tab and reload, it will default to XML unless this is specified
			// (CHECK: frontend client doesn't use XML anywhere, does it...?)
			outputformat: 'json',
			// Skip the cache so we'll hit our breakpoints
			// DANGEROUS! Polling will keep starting new searches.
			//usecache: false
		} : {};

		return {
			...debugParams,

			filter: QueryModule.get.filterString(),
			first: state.global.pageSize * activeView.page,
			group: activeView.groupBy.join(','),

			number: state.global.pageSize,
			field: QueryModule.get.annotatedFieldName(),
			patt: QueryModule.get.patternString(),
			pattgapdata: (QueryModule.get.patternString() && QueryModule.getState().gap) ? QueryModule.getState().gap!.value || undefined : undefined,

			sample: (state.global.sampleMode === 'percentage' && state.global.sampleSize) ? state.global.sampleSize : undefined,
			samplenum: (state.global.sampleMode === 'count' && state.global.sampleSize) ? state.global.sampleSize : undefined,
			sampleseed: state.global.sampleSize != null ? state.global.sampleSeed! /* non-null precondition checked above */ : undefined,

			sort: activeView.sort != null ? activeView.sort : undefined,
			viewgroup: activeView.viewGroup != null ? activeView.viewGroup : undefined,
			context: state.global.context != null ? state.global.context : undefined,
			adjusthits: 'yes'
		};
	}, 'blacklabParameters')
};

const actions = {
	retry: CorpusModule.actions.retry,
	user: CorpusModule.actions.user,
	corpusId: CorpusModule.actions.corpus,

	/** Read the form state, build the query, reset the results page/grouping, etc. */
	searchFromSubmit: b.commit(state => {
		if (state.interface.form === 'search' && state.interface.patternMode === 'extended' && state.patterns.extended.splitBatch) {
			// TODO tidy up implementation of split batch queries
			actions.searchSplitBatches();
			return;
		}
		// Reset the grouping/page/sorting/etc, for all views
		ViewModule.actions.resetAllViews({resetGroupBy: false});

		// Apply the desired grouping for this form, if needed.
		if (state.interface.form === 'explore') {
			switch (state.interface.exploreMode) {
				case 'corpora': {
					// open the 'docs' tab
					InterfaceModule.actions.viewedResults('docs');

					// apply the groupings in the docs tab.
					const m = ViewModule.getOrCreateModule('docs');
					m.actions.groupDisplayMode(state.explore.corpora.groupDisplayMode);
					m.actions.groupBy(state.explore.corpora.groupBy ? [state.explore.corpora.groupBy] : []);
					break;
				}
				case 'frequency':
				case 'ngram': {
					// open the 'hits' tab
					InterfaceModule.actions.viewedResults('hits');
					const m = ViewModule.getOrCreateModule('hits');
					m.actions.groupBy(state.interface.exploreMode === 'ngram' ? [ExploreModule.get.ngram.groupBy()] : [ExploreModule.get.frequency.groupBy()]);
					break;
				}
				default: throw new Error(`Unhandled explore mode ${state.interface.exploreMode} while submitting form`);
			}
		}

		// Open the results, which actually executes the query.
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
	}, 'searchFromSubmit'),

	/**
	 * Same deal as searchFromSubmit, parse the form and generate the appropriate query, but do not change which, and how results are displayed
	 * This is for when the page is first loaded, the url is decoded and might have contained information about how the results are displayed.
	 * This data is now already in the store, we don't want to clear this.
	 *
	 * NOTE: this does make some assumption that the state shape is valid.
	 * Namely that the groupBy parameter makes sense if the current search mode is ngrams or frequencies.
	 */
	searchAfterRestore: b.commit(state => {
		let submittedFormState: QueryModule.ModuleRootState;

		// jump through some typescript hoops
		const activeForm = InterfaceModule.get.form();
		switch (activeForm) {
			case 'explore': {
				const exploreMode = InterfaceModule.get.exploreMode();
				submittedFormState = {
					form: activeForm,
					subForm: exploreMode,
					// Copy so we don't alias, we should "snapshot" the current form
					// Also cast back into correct type after parsing/stringifying so we don't lose type-safety (parse returns any)
					filters: get.filtersActive() ? cloneDeep(FilterModule.get.activeFiltersMap()) as ReturnType<typeof FilterModule['get']['activeFiltersMap']> : {},
					formState: cloneDeep(ExploreModule.getState()[exploreMode]) as ExploreModule.ModuleRootState[typeof exploreMode],
					shared: cloneDeep(PatternModule.get.shared()) as PatternModule.ModuleRootState['shared'],
					gap: get.gapFillingActive() ? GapModule.getState() : GapModule.defaults,
				};
				break;
			}
			case 'search': { // activeForm === 'search'
				const patternMode = InterfaceModule.get.patternMode();
				submittedFormState = {
					form: activeForm,
					subForm: patternMode,
					// Copy so we don't alias the objects, we should "snapshot" the current form
					// Also cast back into correct type after parsing/stringifying so we don't lose type-safety (parse returns any)
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
	}, 'searchFromRestore'),

	/**
	 * TODO: this is ugly code, and heavily relies on knowledge about other parts of the codebase, mostly the history objects - clean it up in some manner.
	 *
	 * Split batch queries: allow batch submission of many cql patterns
	 * Works by splitting OR'ed annotations into individual queries containing just that one value.
	 * So say we have
	 * ```typescript
	 * [{
	 *     id: 'lemma',
	 *     value: 'a|b',
	 *     ...
	 * }, {
	 *     id: 'word',
	 *     value: 'c|d',
	 *     ...
	 * }]
	 * ```
	 * Normally the resulting query would be
	 * ```typescript
	 * - [lemma="a|b" & word="c|d"]
	 * ```
	 * But using split batches, the following 4 queries are generated:
	 * ```typescript
	 * - [lemma = "a"]
	 * - [lemma = "b"]
	 * - [word  = "c"]
	 * - [word  = "d"]
	 * ```
	 * Then the first query in the list is submitted, and the rest is pushed into the history so the user can load them at a later moment.
	 */
	searchSplitBatches: b.commit(state => {
		if (state.interface.form !== 'search' || state.interface.patternMode !== 'extended' || !state.patterns.extended.splitBatch) {
			throw new Error('Attempting to submit split batches in wrong view');
		}

		const sharedBatchState: Omit<HistoryModule.HistoryEntry, 'patterns'> = {
			view: ViewModule.getOrCreateModule(InterfaceModule.getState().viewedResults!).getState(),
			explore: ExploreModule.defaults,
			global: GlobalResultsModule.getState(),
			interface: InterfaceModule.getState(),
			filters: get.filtersActive() ? FilterModule.get.activeFiltersMap() : {},
			gap: get.gapFillingActive() ? GapModule.getState() : GapModule.defaults,
			concepts: ConceptModule.getState(),
			glosses: GlossModule.getState(),
		};

		const annotations = PatternModule.get.activeAnnotations();
		const [withinClauses] = getWithinClausesFromFilters(state.filters.filters, state.patterns);
		const submittedFormStates = annotations
		.filter(a => a.type !== 'pos')
		.flatMap(a => a.value.split('|').map(value => ({...a,value})))
		.map<HistoryModule.HistoryEntryPatternAndUrl>(a => ({
			entry: {
				...sharedBatchState,
				patterns: {
					advanced: {
						query: null,
						targetQueries: [],
					},
					concept: null,
					glosses: null,
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
				state.patterns.shared.targets,
				state.patterns.shared.alignBy || state.ui.search.shared.alignBy.defaultValue),
			// TODO :( url generation is too encapsulated to completely repro here
			url: ''
		}))
		// remove vuex listeners from aliased parts of the store.
		.map(v => cloneDeep(v));

		// We can't just run a submit for every subquery, as that would be REALLY slow.
		// Even if it were fast, mutations within a single vue frame are debounced,
		// so listeners won't be called for any update except the last,
		// preventing the history entries from being created.
		// Unfortunately we need to copy the history entry generation code :(
		// See streams.ts

		submittedFormStates.forEach(HistoryModule.actions.addEntry);
		const mostRecent = HistoryModule.getState()[0];
		if (mostRecent) {
			actions.replace(mostRecent);
		}
	}, 'searchSplitBatches'),

	reset: b.commit(state => {
		FormManager.actions.reset();
		ViewModule.actions.resetAllViews({resetGroupBy: true});
		QueryModule.actions.reset();
		ArticleModule.actions.reset();
		// TODO check if everything is reset properly.
	}, 'resetRoot'),

	/**
	 * Is called when loading a search history entry, or when navigating in browser history.
	 * Should fully reset and overwrite form state, and then execute a search.
	*/
	replace: b.commit((_, payload: HistoryModule.HistoryEntry&{article?: ArticleModule.HistoryState} ) => {
		FormManager.actions.replace(payload);
		GlobalResultsModule.actions.replace(payload.global);
		// clear all views, otherwise inactive views would persist current settings.
		ViewModule.actions.resetAllViews({resetGroupBy: true});
		// The state we just restored has results open, so execute a search.
		if (payload.interface.viewedResults != null) {
			ViewModule.actions.replaceView({view: payload.interface.viewedResults, data: payload.view});
			actions.searchAfterRestore();
		}
		if (payload.article) {
			ArticleModule.actions.replace(payload.article);
		}
	}, 'replaceRoot'),
};

const privateActions = {
	/** The current corpus has changed or been cleared, re-run initialization. */
	corpusChanged: b.dispatch(async ({state}) => {
		// NOTE: this function should return a promise that only resolves once all stores are initialized.
		const corpus = state.corpus.isLoaded() ? state.corpus.value : null;
		// Do this one first as it customizes the UI and thus has impact on how the other stores behave
		await UIModule.init(corpus);

		await FormManager.init(corpus);
		await ViewModule.init(corpus);
		await GlobalResultsModule.init(corpus);

		await TagsetModule.init(corpus);
		await HistoryModule.init(corpus);
		await QueryModule.init(corpus);

		await ArticleModule.init(corpus);

		// XXX: Changing the corpus recreates these modules, so replace them in window...
		// Hack!
		(window as any).vuexModules.results = {
			...ViewModule,
			hits: ViewModule.getOrCreateModule('hits'),
			docs: ViewModule.getOrCreateModule('docs'),
		};
	}, 'corpusChanged'),
}

// NOTE: only call this after creating all getters and actions etc.
// NOTE: process.env is empty at runtime, but webpack inlines all values at compile time, so this check works.
declare const process: any;
const store = b.vuexStore({
	state: {
		storeLoadingState: Vue.observable(loadableFromObservable(loadingState$.pipe(mapLoaded(v => undefined)), [])),
	} as RootState, // shut up typescript, the state we pass here is merged with the modules initial states internally.
	strict: process.env.NODE_ENV === 'development',
});

const init = () => {};

// Debugging helpers.
(window as any).vuexModules = {
	root: {
		store,
		getState,
		get,
		actions,
		init
	},

	corpus: CorpusModule,
	history: HistoryModule,
	query: QueryModule,
	tagset: TagsetModule,
	ui: UIModule,
	concepts: ConceptModule, // Jesse
	glosses: GlossModule,
	explore: ExploreModule,
	form: FormManager,
	filters: FilterModule,
	interface: InterfaceModule,
	patterns: PatternModule,
	gap: GapModule,
	article: ArticleModule,

	// backwards-compatibility.
	// docs and hits used to be under results.docs and results.hits. Now they are under views.docs and views.hits
	// While the main module used to be under results. Now it's under views, and the submodules (including hits and docs) are no longer visible directly.
	results: {
		...ViewModule,
		hits: ViewModule.getOrCreateModule('hits'),
		docs: ViewModule.getOrCreateModule('docs'),
	},
	views: ViewModule,
	global: GlobalResultsModule,
};

(window as any).vuexStore = store;

export {
	RootState,

	store,
	getState,
	get,
	actions,
	init,
	loadingState$
};
