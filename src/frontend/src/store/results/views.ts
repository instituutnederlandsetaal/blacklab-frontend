/**
 * This module contains a sub-module for every type of results view.
 * The default installation of blacklab-frontend supports 'hits' and 'docs' views.
 * But addon scripts can add more views, if required.
 * Those will get their own sub-module here.
 */
import type { ModuleBuilder } from '@/store/reactive-store';
import { getStoreBuilder } from '@/store/reactive-store';
import cloneDeep from 'clone-deep';

import type { RootState } from '@/store/';
import type { CorpusChange } from '@/store/async-loaders';

const namespace = 'views';

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

const viewsBuilder = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(initialState));

const createActions = (b: ModuleBuilder<ViewRootState, RootState>) => ({
	customState: b.commit((state, payload: any) => state.customState = payload, 'customState'),
	groupBy: b.commit((state, payload: string[]) => {
		// can't just replace array since listeners might be attached to properties in a single entry, and they won't be updated.
		state.groupBy.splice(0, state.groupBy.length, ...payload);
		state.viewGroup = null;
		state.sort = null;
		state.first = 0;
		state.requestedRange = null;
	}, 'groupBy'),
	sort: b.commit((state, payload: string|null) => state.sort = payload, 'sort'),

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
	first: b.commit((state, payload: number) => {
		state.first = Math.max(0, payload);
		state.requestedRange = null;
	}, 'first') ,
	/** Set the number of results to retrieve */
	number: b.commit((state, payload: number) => {
		state.number = Math.max(1, payload);
		state.requestedRange = null;
	}, 'number'),
	/** Convenience action to set both first and number at once */
	range: b.commit((state, payload: {first: number, number: number}) => {
		state.first = Math.max(0, payload.first);
		state.number = Math.max(1, payload.number);
		state.requestedRange = null;
	}, 'range'),
	setRequestedRange: b.commit((state, payload: RequestedRange) => {
		state.requestedRange = {
			first: Math.max(0, payload.first),
			number: Math.max(1, payload.number)
		};
	}, 'setRequestedRange'),
	clearRequestedRange: b.commit(state => {
		state.requestedRange = null;
	}, 'clearRequestedRange'),
	viewGroup: b.commit((state, payload: string|null) => {
		state.viewGroup = payload;
		state.sort = null;
		state.first = 0;
		state.requestedRange = null;
	},'viewgroup'),
	groupDisplayMode: b.commit((state, payload: string|null) => state.groupDisplayMode = payload, 'groupDisplayMode'),

	reset: b.commit((state, props: {resetGroupBy: boolean}) => {
		// This may case an error if the current group settings are invalid for the new view.
		let prevGroupBy = state.groupBy;
		Object.assign(state, cloneDeep(initialViewState))
		if (!props.resetGroupBy) state.groupBy = prevGroupBy;
	}, 'reset'),
	replace: b.commit((state, payload: ViewRootState) => {
		Object.assign(state, cloneDeep(payload));
		if (state.requestedRange == null) {
			state.requestedRange = null;
		}
	}, 'replace'),
});

const createGetters = (b: ModuleBuilder<ViewRootState, RootState>) => ({});

/**
 * Create a module with the given namespace and initial state.
 * @param viewName key of this module in the root store
 * @param customInitialState if you want to override part of the initial state for this part of the store. Usually only change the customState property.
 * @returns a module object with actions, getters, namespace, getState and a vuex module.
 */
export const createViewModule = (viewName: string, customInitialState?: Partial<ViewRootState>) => {
	const b = viewsBuilder.module<ViewRootState>(viewName, Object.assign(cloneDeep(initialViewState), customInitialState));
	const m = {
		actions: createActions(b),
		get: createGetters(b),
		namespace: viewName,
		getState: b.state(),
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
	resetFirst: viewsBuilder.commit(() => Object.values(moduleCache).forEach(m => m.actions.first(0)), 'resetFirst'),
	resetViewGroup: viewsBuilder.commit(() => Object.values(moduleCache).forEach(m => m.actions.viewGroup(null)), 'resetViewGroup'),
	resetAllViews: viewsBuilder.dispatch(({rootState}, props: {resetGroupBy: boolean}) => {
		Object.values(moduleCache).forEach(m => {
			m.actions.reset(props);
			m.actions.number(rootState.global.pageSize);
		});
	}, 'reset'),
	replaceView: viewsBuilder.commit((_, payload: {view: string|null, data: ViewRootState}) => {
		if (payload.view) getOrCreateModule(payload.view).actions.replace(payload.data);
	}, 'replaceResultsView'),
};

const get = {

}

const init = async (state: CorpusChange)=> {
	// Clear all views so the default result modules can be recreated for the new corpus.
	Object.keys(moduleCache).forEach(key => {
		viewsBuilder.deleteModule(key);
		delete moduleCache[key];
	});
	getOrCreateModule('hits');
	getOrCreateModule('docs');
	await actions.resetAllViews({resetGroupBy: true});
};

type ViewModule = ReturnType<typeof createViewModule>;

export { actions, get, getOrCreateModule, init, initialState, initialViewState };
export type { ModuleRootState, ViewModule, ViewRootState };

