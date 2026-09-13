/**
 * This module contains a sub-module for every type of results view.
 * The default installation of blacklab-frontend supports 'hits' and 'docs' views.
 * But addon scripts can add more views, if required.
 * Those will get their own sub-module here.
 */
import cloneDeep from 'clone-deep';
import { markRaw, reactive, shallowReactive, toValue, type MaybeRefOrGetter } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import { expandResultRange, type ResultRange } from '@/features/search/model/results/pagination';
import type { GroupDisplayMode } from '@/features/search/model/results/result-types';
import type { BLCollocationScorer } from '@/types/blacklabtypes';

type ModuleRootState = Record<string, ViewRootState>;
export type { ResultRange } from '@/features/search/model/results/pagination';
type ViewRootState = {
	customState: any;
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

const initialState: ModuleRootState = {};
const initialViewState: ViewRootState = {
	customState: null,
	groupBy: [],
	first: 0,
	number: 20, // default page size
	collocationScorer: 'coll-dice',
	sort: null,
	viewGroup: null,
	groupDisplayMode: null,
};

const createActions = (state: ViewRootState, defaults: ViewRootState, pageSize: MaybeRefOrGetter<number>) => ({
	customState: (payload: any) => (state.customState = payload),
	groupBy: (payload: string[]) => {
		// can't just replace array since listeners might be attached to properties in a single entry, and they won't be updated.
		state.groupBy.splice(0, state.groupBy.length, ...payload);
		state.viewGroup = null;
		state.sort = null;
		state.first = 0;
	},
	sort: (payload: string | null) => (state.sort = payload),

	/** Set the first result offset */
	first: (payload: number) => {
		state.first = Math.max(0, payload);
	},
	/** Set the number of results to retrieve */
	number: (payload: number) => {
		state.number = Math.max(1, payload);
	},
	/** Convenience action to set both first and number at once */
	range: (payload: { first: number; number: number }) => {
		state.first = Math.max(0, payload.first);
		state.number = Math.max(1, payload.number);
	},
	collocationScorer: (payload: BLCollocationScorer) => {
		state.collocationScorer = payload;
		state.first = 0;
	},
	viewGroup: (payload: string | null) => {
		state.viewGroup = payload;
		state.sort = null;
		state.first = 0;
	},
	groupDisplayMode: (payload: GroupDisplayMode | null) => (state.groupDisplayMode = payload),

	reset: (payload: { resetGroupBy: boolean }) => {
		// This may case an error if the current group settings are invalid for the new view.
		let prevGroupBy = state.groupBy;
		Object.assign(state, cloneDeep(defaults), { first: 0, number: toValue(pageSize) });
		if (!payload.resetGroupBy) state.groupBy = prevGroupBy;
	},
	replace: (payload: ViewRootState) => {
		Object.assign(state, cloneDeep(payload));
	},
});

/** Create a view using its own defaults and an explicit page-size preference. */
export const createViewModule = (pageSize: MaybeRefOrGetter<number>, customInitialState?: Partial<ViewRootState>) => {
	const defaults = Object.assign(cloneDeep(initialViewState), cloneDeep(customInitialState));
	const state = reactive<ViewRootState>(Object.assign(cloneDeep(initialViewState), { number: toValue(pageSize) }, cloneDeep(customInitialState)));
	const m = {
		actions: markRaw(createActions(state, defaults, pageSize)),
		get: markRaw({
			selectedRange: (): ResultRange => ({ first: state.first, number: state.number }),
			expandedRequestRange: (): ResultRange => expandResultRange(state, toValue(pageSize)),
		}),
		getState: () => state,
	};
	return m;
};
type ViewModule = ReturnType<typeof createViewModule>;

// store the sub-modules we create so we can access them later
const moduleCache = shallowReactive<Record<string, ViewModule>>({});
let pageSizePreference: MaybeRefOrGetter<number>;
function setPageSizePreference(value: MaybeRefOrGetter<number>) {
	pageSizePreference = value;
}
function getOrCreateModule(view: string, initialState?: ViewRootState) {
	if (view == null) {
		throw new Error('view is null');
	}
	if (!moduleCache[view]) {
		if (pageSizePreference === undefined) throw new Error('Result views initialized without a page-size preference.');
		moduleCache[view] = createViewModule(() => toValue(pageSizePreference), initialState);
	}
	return moduleCache[view];
}

const actions = {
	resetFirst: () => Object.values(moduleCache).forEach(m => m.actions.first(0)),
	resetViewGroup: () => Object.values(moduleCache).forEach(m => m.actions.viewGroup(null)),
	resetAllViews: (props: { resetGroupBy: boolean }) => {
		Object.values(moduleCache).forEach(m => m.actions.reset(props));
	},
	replaceView: (payload: { view: string | null; data: ViewRootState }) => {
		if (payload.view) getOrCreateModule(payload.view).actions.replace(payload.data);
	},
};

const get = {};

const init = (_state: CorpusContext) => {
	// Clear all views so the default result modules can be recreated for the new corpus.
	Object.keys(moduleCache).forEach(key => {
		delete moduleCache[key];
	});
	getOrCreateModule('hits');
	getOrCreateModule('docs');
	actions.resetAllViews({ resetGroupBy: true });
};

/** Get a snapshot of all view states as a record keyed by view name. */
function getState(): ModuleRootState {
	const result: ModuleRootState = {};
	for (const [key, mod] of Object.entries(moduleCache)) {
		result[key] = mod.getState();
	}
	return result;
}

/** Iterate over all view states. Used by global module to adjust pagination on page-size change. */
function forEachView(fn: (view: ViewRootState) => void) {
	Object.values(moduleCache).forEach(m => fn(m.getState()));
}

export { actions, forEachView, get, getOrCreateModule, getState, init, initialState, initialViewState, setPageSizePreference };
export type { ModuleRootState, ViewModule, ViewRootState };
