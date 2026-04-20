/**
 * This module contains a sub-module for every type of results view.
 * The default installation of blacklab-frontend supports 'hits' and 'docs' views.
 * But addon scripts can add more views, if required.
 * Those will get their own sub-module here.
 */
import cloneDeep from 'clone-deep';

import type { CorpusChange } from '@/api/async/logic/corpus/corpus-data-from-id';
import * as GlobalResultsModule from '@/store/results/global';
import { reactive } from 'vue';

type ModuleRootState = Record<string, ViewRootState>;
type RequestedRange = {
	first: number;
	number: number;
};
type ViewRootState = {
	customState: any;
	groupBy: string[];
	/** The 0-indexed offset of the first result to retrieve */
	first: number;
	/** The number of results to retrieve */
	number: number;
	/** The original range requested via URL. Null means no shared URL-range context is active. */
	requestedRange: RequestedRange|null;
	sort: string|null;
	viewGroup: string|null;
	groupDisplayMode: string|null;
};

const initialState: ModuleRootState = {};
const initialViewState: ViewRootState = {
	customState: null,
	groupBy: [],
	first: 0,
	number: 20, // default page size
	requestedRange: null,
	sort: null,
	viewGroup: null,
	groupDisplayMode: null,
};

const createActions = (state: ViewRootState) => ({
	customState: (payload: any) => state.customState = payload,
	groupBy: (payload: string[]) => {
		// can't just replace array since listeners might be attached to properties in a single entry, and they won't be updated.
		state.groupBy.splice(0, state.groupBy.length, ...payload);
		state.viewGroup = null;
		state.sort = null;
		state.first = 0;
		state.requestedRange = null;
	},
	sort: (payload: string|null) => state.sort = payload,

	/*
	 * Pagination flow overview (hits/docs each have their own view state):
	 * 1) Fresh submit (searchFromSubmit): all views are reset, then number is set to global.pageSize.
	 *    This guarantees URL serialization uses the active user's configured page size instead of the
	 *    hardcoded initial fallback (20).
	 * 2) URL restore (replaceRoot in root store): the active view is replaced from URL first/number,
	 *    then a requestedRange may be set when the URL span is incompatible with local page boundaries.
	 * 3) Local page-size change (global module): first/number are re-aligned to new boundaries and
	 *    requestedRange is cleared immediately.
	 * 4) Local pagination/grouping interactions (first/number/range/groupBy/viewGroup actions here):
	 *    requestedRange is cleared, because the user is now navigating in local state, not shared URL context.
	 */


	/** Set the first result offset */
	first: (payload: number) => {
		state.first = Math.max(0, payload);
		state.requestedRange = null;
	},
	/** Set the number of results to retrieve */
	number: (payload: number) => {
		state.number = Math.max(1, payload);
		state.requestedRange = null;
	},
	/** Convenience action to set both first and number at once */
	range: (payload: {first: number, number: number}) => {
		state.first = Math.max(0, payload.first);
		state.number = Math.max(1, payload.number);
		state.requestedRange = null;
	},
	setRequestedRange: (payload: RequestedRange) => {
		state.requestedRange = {
			first: Math.max(0, payload.first),
			number: Math.max(1, payload.number)
		};
	},
	clearRequestedRange: () => state.requestedRange = null,
	viewGroup: (payload: string|null) => {
		state.viewGroup = payload;
		state.sort = null;
		state.first = 0;
		state.requestedRange = null;
	},
	groupDisplayMode: (payload: string|null) => state.groupDisplayMode = payload,

	reset: (payload: {resetGroupBy: boolean}) => {
		// This may case an error if the current group settings are invalid for the new view.
		let prevGroupBy = state.groupBy;
		Object.assign(state, cloneDeep(initialViewState))
		if (!payload.resetGroupBy) state.groupBy = prevGroupBy;
	},
	replace: (payload: ViewRootState) => {
		Object.assign(state, cloneDeep(payload));
		if (state.requestedRange == null) {
			state.requestedRange = null;
		}
	},
});

const createGetters = (state: ViewRootState) => ({});

/**
 * Create a module with the given namespace and initial state.
 * @param viewName key of this module in the root store
 * @param customInitialState if you want to override part of the initial state for this part of the store. Usually only change the customState property.
 * @returns a module object with actions, getters, namespace, getState and a vuex module.
 */
export const createViewModule = (viewName: string, customInitialState?: Partial<ViewRootState>) => {
	const state = reactive<ViewRootState>(Object.assign(cloneDeep(initialViewState), cloneDeep(customInitialState)));
	const m = {
		actions: createActions(state),
		get: createGetters(state),
		getState: () => state,
	};
	return m;
};


// store the sub-modules we create so we can access them later
const moduleCache: Record<string, ReturnType<typeof createViewModule>> = {};
function getOrCreateModule(view: string, initialState?: ViewRootState) {
	if (view == null) { throw new Error('view is null'); }
	if (!moduleCache[view]) {
		moduleCache[view] = createViewModule(view, initialState);
	}
	return moduleCache[view];
}

const actions = {
	resetFirst: () => Object.values(moduleCache).forEach(m => m.actions.first(0)),
	resetViewGroup: () => Object.values(moduleCache).forEach(m => m.actions.viewGroup(null)),
	resetAllViews: (props: {resetGroupBy: boolean}) => {
		Object.values(moduleCache).forEach(m => {
			m.actions.reset(props);
			m.actions.number(GlobalResultsModule.getState().pageSize);
		});
	},
	replaceView: (payload: {view: string|null, data: ViewRootState}) => {
		if (payload.view) getOrCreateModule(payload.view).actions.replace(payload.data);
	},
};

const get = {

}

const init = async (state: CorpusChange)=> {
	// Clear all views so the default result modules can be recreated for the new corpus.
	Object.keys(moduleCache).forEach(key => {
		delete moduleCache[key];
	});
	getOrCreateModule('hits');
	getOrCreateModule('docs');
	await actions.resetAllViews({resetGroupBy: true});
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

type ViewModule = ReturnType<typeof createViewModule>;

export { actions, forEachView, get, getOrCreateModule, getState, init, initialState, initialViewState };
export type { ModuleRootState, ViewModule, ViewRootState };

