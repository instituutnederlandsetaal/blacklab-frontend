import cloneDeep from 'clone-deep';
import { computed, markRaw, reactive, ref, shallowReactive, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

import { expandResultRange, resizeResultRange, type ResultRange } from '@/pages/search/model/results/pagination';
import type { EffectiveSearchParameters } from '@/pages/search/model/results/result-types';
import type { Corpus } from '@/types/apptypes';
import type { BLCollocationScorer } from '@/types/blacklabtypes';
import type { GroupDisplayMode } from '@/types/group-display-mode';

import type { SubmittedSearch } from '../submitted-search';
import { searchParametersFromState } from './search-parameters';

import createAppInjection from '@/shared/vue/injection';

export const defaults = {
	pageSize: 20,
	sampleMode: 'percentage' as const,
};

export type SharedResultSettings = {
	sampleMode: 'percentage' | 'count';
	sampleSeed: number | null;
	sampleSize: number | null;
	/** context can be a string or number in BlackLab, but for now in the form we only allow numbers. */
	context: number | null;
};

export type ResultSettings = SharedResultSettings & { pageSize: number };

export type ResultViewState = {
	customState: unknown;
	groupBy: string[];
	/** The 0-indexed offset of the first result to retrieve */
	first: number;
	/** The number of results to retrieve */
	number: number;
	collocationScorer: BLCollocationScorer;
	sort: string | null;
	viewGroup: string | null;
	groupDisplayMode: GroupDisplayMode | null;
};

export const initialViewState: ResultViewState = {
	customState: null,
	groupBy: [],
	first: 0,
	number: defaults.pageSize,
	collocationScorer: 'coll-dice',
	sort: null,
	viewGroup: null,
	groupDisplayMode: null,
};

export type ActiveSearchInputs = {
	corpus: MaybeRefOrGetter<Corpus | undefined>;
	submitted: MaybeRefOrGetter<SubmittedSearch | undefined>;
	withSpans: (query: string) => boolean | null;
	debug: MaybeRefOrGetter<boolean>;
};

const defaultSettings: SharedResultSettings = { sampleMode: defaults.sampleMode, sampleSeed: null, sampleSize: null, context: null };

function validPageSize(size: number) {
	return Number.isInteger(size) && size >= 1 && size <= 1000;
}

export class ResultsState {
	readonly parameters;
	readonly settings: ResultSettings;
	readonly views = shallowReactive(new Map<string, ResultView>());
	private readonly selection = ref<string | null>(null);

	constructor(inputs: ActiveSearchInputs, pageSize: Ref<number>) {
		markRaw(this);
		if (!validPageSize(pageSize.value)) pageSize.value = defaults.pageSize;
		this.settings = reactive({ pageSize, ...defaultSettings });
		this.resetViews();
		this.parameters = computed<EffectiveSearchParameters | undefined>(previous => {
			const next = searchParametersFromState({
				corpus: toValue(inputs.corpus),
				submitted: toValue(inputs.submitted),
				viewName: this.selectedViewName,
				view: this.selectedView?.state,
				settings: this.settings,
				debug: toValue(inputs.debug),
				withSpans: inputs.withSpans,
			});
			return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
		});
	}

	get selectedViewName() {
		return this.selection.value;
	}
	get selectedView() {
		return this.selection.value === null ? null : (this.views.get(this.selection.value) ?? null);
	}

	view(name: string, initial?: Partial<ResultViewState>) {
		if (name == null) throw new Error('view is null');
		let view = this.views.get(name);
		if (!view) {
			view = new ResultView(() => this.settings.pageSize, initial);
			this.views.set(name, view);
		}
		return view;
	}

	selectView(name: string | null) {
		if (name !== null) this.view(name);
		this.selection.value = name;
		return name;
	}

	restore(settings: SharedResultSettings, viewName: string | null, state: ResultViewState) {
		this.resetAllViews();
		this.replaceSettings(settings);
		if (viewName) this.view(viewName).replace(state);
		this.selectView(viewName);
	}

	resetViews() {
		this.selection.value = null;
		this.views.clear();
		this.view('hits');
		this.view('docs');
	}

	resetRanges() {
		for (const { state } of this.views.values()) Object.assign(state, { first: 0, number: this.settings.pageSize, viewGroup: null });
	}

	resetAllViews(resetGroupBy = true) {
		for (const view of this.views.values()) view.reset(resetGroupBy);
	}

	resetFirst() {
		for (const { state } of this.views.values()) state.first = 0;
	}

	setPageSize(size: number) {
		const previous = this.settings.pageSize;
		if (!validPageSize(size) || previous === size) return;
		this.settings.pageSize = size;
		this.resizeRanges(previous, size);
	}

	resizeRanges(previous: number, size: number) {
		for (const { state } of this.views.values()) Object.assign(state, resizeResultRange(state, previous, size));
	}

	setSampleMode(mode?: ResultSettings['sampleMode']) {
		const next = mode === 'count' ? mode : defaults.sampleMode;
		if (this.settings.sampleMode !== next) {
			this.settings.sampleMode = next;
			this.settings.sampleSize = null;
		}
		this.resetFirst();
	}

	setSampleSeed(seed: number | null) {
		this.updateSampleSeed(seed);
		if (this.selectedView?.state.groupBy.length) this.resetFirst();
	}

	private updateSampleSeed(seed: number | null) {
		this.settings.sampleSeed = seed ?? (this.settings.sampleSize === null ? null : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
	}

	private updateSampleSize(size: number | null) {
		const limit = this.settings.sampleMode === 'percentage' ? 100 : Infinity;
		this.settings.sampleSize = size === null ? null : Math.max(0, Math.min(size, limit));
	}

	setSampleSize(size: number | null) {
		this.updateSampleSize(size);
		this.updateSampleSeed(this.settings.sampleSeed);
		this.resetFirst();
	}

	setContext(context: number | null) {
		this.settings.context = context;
	}

	replaceSettings({ sampleMode, sampleSize, sampleSeed, context }: SharedResultSettings) {
		this.settings.sampleMode = sampleMode === 'count' ? sampleMode : defaults.sampleMode;
		this.updateSampleSize(sampleSize);
		this.updateSampleSeed(sampleSeed);
		this.settings.context = context;
	}

	resetSettings() {
		Object.assign(this.settings, defaultSettings);
	}

	reset() {
		this.resetSettings();
		this.resetViews();
	}
}

export const [resultsStateKey, provideResultsState, useResultsState] = createAppInjection<ResultsState>('results-state');

export class ResultView {
	readonly state: ResultViewState;
	private readonly defaults: ResultViewState;
	constructor(
		private readonly pageSize: MaybeRefOrGetter<number>,
		initial?: Partial<ResultViewState>,
	) {
		markRaw(this);
		this.defaults = cloneDeep({ ...initialViewState, number: toValue(pageSize), ...initial });
		this.state = reactive(cloneDeep(this.defaults));
	}
	get selectedRange(): ResultRange {
		return { first: this.state.first, number: this.state.number };
	}
	get expandedRequestRange(): ResultRange {
		return expandResultRange(this.state, toValue(this.pageSize));
	}
	setGroupBy(groupBy: string[]) {
		this.state.groupBy.splice(0, this.state.groupBy.length, ...groupBy);
		Object.assign(this.state, { viewGroup: null, sort: null, first: 0 });
	}
	setRange(range: ResultRange) {
		this.state.first = Math.max(0, range.first);
		this.state.number = Math.max(1, range.number);
	}
	setCollocationScorer(scorer: BLCollocationScorer) {
		this.state.collocationScorer = scorer;
		this.state.first = 0;
	}
	setViewGroup(group: string | null) {
		Object.assign(this.state, { viewGroup: group, sort: null, first: 0 });
	}
	reset(resetGroupBy = true) {
		const previous = this.state.groupBy;
		Object.assign(this.state, cloneDeep(this.defaults), { first: 0, number: toValue(this.pageSize) });
		if (!resetGroupBy) this.state.groupBy = previous;
	}
	replace(state: ResultViewState) {
		Object.assign(this.state, cloneDeep(state));
	}
}
