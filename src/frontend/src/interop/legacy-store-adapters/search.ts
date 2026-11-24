import { reactive, type MaybeRefOrGetter } from 'vue';

import * as ArticleModule from '@/app/state/article-configuration';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as HistoryModule from '@/features/history/model/query-history-state';
import type { SearchFormActions } from '@/features/search/bindings/search-form';
import { defaults, type ResultsState, ResultView, initialViewState, type ResultViewState } from '@/features/search/model/results/results-state';

/** Custom results components receive the same store shape as legacy window globals. */
export class LegacyResultView {
	readonly actions;
	readonly get;
	readonly getState;
	constructor(view: ResultView) {
		this.getState = () => view.state;
		this.get = { selectedRange: () => view.selectedRange, expandedRequestRange: () => view.expandedRequestRange };
		this.actions = {
			customState: (value: unknown) => (view.state.customState = value),
			groupBy: view.setGroupBy.bind(view),
			sort: (value: string | null) => (view.state.sort = value),
			first: (first: number) => view.setRange({ first, number: view.state.number }),
			number: (number: number) => view.setRange({ first: view.state.first, number }),
			range: view.setRange.bind(view),
			collocationScorer: view.setCollocationScorer.bind(view),
			viewGroup: view.setViewGroup.bind(view),
			groupDisplayMode: (value: ResultViewState['groupDisplayMode']) => (view.state.groupDisplayMode = value),
			reset: ({ resetGroupBy }: { resetGroupBy: boolean }) => view.reset(resetGroupBy),
			replace: view.replace.bind(view),
		};
	}
}

/** Add search compatibility methods while retaining the shared article configuration under root. */
export function createLegacySearchStoreGlobals(results: ResultsState, form: SearchFormActions, initializeCorpus: (context: CorpusContext) => void) {
	const selection = reactive({
		get viewedResults() {
			return results.selectedViewName;
		},
		set viewedResults(view: string | null) {
			results.selectView(view);
		},
	});
	const modules = new WeakMap<ResultView, LegacyResultView>();
	const getOrCreateModule = (name: string, initial?: Partial<ResultViewState>) => {
		const view = results.view(name, initial);
		let module = modules.get(view);
		if (!module) {
			module = new LegacyResultView(view);
			modules.set(view, module);
		}
		return module;
	};
	const views = {
		selection,
		getSelectedViewName: () => results.selectedViewName,
		getSelectedView: () => (results.selectedViewName === null ? null : getOrCreateModule(results.selectedViewName)),
		resetRanges: () => results.resetRanges(),
		resizeRanges: results.resizeRanges.bind(results),
		reset: () => results.resetViews(),
		getSelectedViewSettings: () => results.selectedView?.state ?? null,
		selectView: results.selectView.bind(results),
		getOrCreateModule,
		createViewModule: (pageSize: MaybeRefOrGetter<number>, initial?: Partial<ResultViewState>) => new LegacyResultView(new ResultView(pageSize, initial)),
		initialState: {} as Record<string, ResultViewState>,
		initialViewState,
		get: {},
		init: () => results.resetViews(),
		getState: () => Object.fromEntries([...results.views].map(([name, view]) => [name, view.state])),
		forEachView: (visit: (state: ResultViewState) => void) => results.views.forEach(view => visit(view.state)),
		actions: {
			resetFirst: results.resetFirst.bind(results),
			resetViewGroup: () => results.views.forEach(view => view.setViewGroup(null)),
			resetAllViews: ({ resetGroupBy }: { resetGroupBy: boolean }) => results.resetAllViews(resetGroupBy),
			replaceView: ({ view, data }: { view: string | null; data: ResultViewState }) => {
				if (view) results.view(view).replace(data);
			},
		},
	};
	const vuexModules = {
		root: {
			get: {
				viewedResultsSettings: views.getSelectedViewSettings,
				blacklabParameters: () => results.parameters.value,
				...ArticleModule.get,
			},
			getState: ArticleModule.getState,
			actions: {
				searchFromSubmit: form.submit,
				reset: form.reset,
				/** Compatibility for scripts that used to wrap store actions in a navigation command. */
				navigateSearch: async (change: () => unknown) => {
					change();
				},
				...ArticleModule.actions,
			},
			init: initializeCorpus,
		},
		history: HistoryModule,
		interface: {
			getState: () => selection,
			get: { viewedResults: views.getSelectedViewName },
			actions: { viewedResults: (view: string | null) => results.selectView(view) },
		},
		views,
		results: {
			...views,
			get hits() {
				return getOrCreateModule('hits');
			},
			get docs() {
				return getOrCreateModule('docs');
			},
		},
		global: {
			getState: () => results.settings,
			get: {},
			defaults,
			init: () => results.resetSettings(),
			actions: {
				pageSize: results.setPageSize.bind(results),
				sampleMode: results.setSampleMode.bind(results),
				sampleSeed: results.setSampleSeed.bind(results),
				sampleSize: results.setSampleSize.bind(results),
				context: results.setContext.bind(results),
				reset: results.resetSettings.bind(results),
				replace: results.replaceSettings.bind(results),
			},
		},
	};

	return vuexModules;
}
