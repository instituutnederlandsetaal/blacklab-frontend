/**
 * This module contains a sub-module for every type of results view.
 * The default installation of corpus-frontend supports 'hits' and 'docs' views.
 * But addon scripts can add more views, if required.
 * Those will get their own sub-module here.
 */
import {ModuleBuilder, getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';

import {RootState} from '@/store/';

const namespace = 'views';

type ModuleRootState = Record<string, ViewRootState>;
type ViewRootState = {
	customState: any;
	groupBy: string[];
	page: number;
	sort: string|null;
	viewGroup: string|null;
	groupDisplayMode: string|null;
};

const initialState: ModuleRootState = {};
const initialViewState: ViewRootState = {
	customState: null,
	groupBy: [],
	page: 0,
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
		state.page = 0;
	}, 'groupBy'),
	sort: b.commit((state, payload: string|null) => state.sort = payload, 'sort'),
	page: b.commit((state, payload: number) => state.page = payload, 'page'),
	viewGroup: b.commit((state, payload: string|null) => {
		state.viewGroup = payload;
		state.sort = null;
		state.page = 0;
	},'viewgroup'),
	groupDisplayMode: b.commit((state, payload: string|null) => state.groupDisplayMode = payload, 'groupDisplayMode'),

	reset: b.commit((state, props: {resetGroupBy: boolean}) => {
		// This may case an error if the current group settings are invalid for the new view.
		let prevGroupBy = state.groupBy;
		Object.assign(state, cloneDeep(initialViewState))
		if (!props.resetGroupBy) state.groupBy = prevGroupBy;
	}, 'reset'),
	replace: b.commit((state, payload: ViewRootState) => Object.assign(state, cloneDeep(payload)), 'replace'),
});

const createGetters = (b: ModuleBuilder<ViewRootState, RootState>) => {
	return {};
};

/**
 * Create a module with the given namespace and initial state.
 * @param viewName key of this module in the root store
 * @param customInitialState if you want to override part of the initial state for this part of the store. Usually only change the customState property.
 * @returns a module object with actions, getters, namespace, getState and a vuex module.
 */
export const createViewModule = (viewName: string, customInitialState?: Partial<ViewRootState>) => {
	const b = viewsBuilder.module<ViewRootState>(viewName, cloneDeep(Object.assign(initialViewState, customInitialState))); // Don't alias initialstate of different modules!
	const m = {
		actions: createActions(b),
		get: createGetters(b),
		namespace: viewName,
		getState: b.state(),
	};
	// if already initialized, we need to construct the actual vuex module now.
	// this is a bit hacky, since it isn't supported officially.
	// On the root builder we could call registerModule(), but since this is a ModuleBuilder and not a StoreBuilder,
	// we'll need to do it manually.
	// This was reverse-engineered from the vuex-typex source code.
	function registerModule(this: any, namespace: string) {
		if (this._store && this._vuexModule) {
			var mBuilder = this._moduleBuilders[namespace];
			if (!mBuilder)
				throw 'fail to register module: ' + namespace;
			mBuilder._provideStore(this._store);
			var vModule = mBuilder.vuexModule();
			this._store.registerModule([this.namespace, namespace], vModule);
			this._vuexModule.modules[namespace] = vModule;
		}
		else {
			throw 'vuexStore hasn\'t been called yet, use module() instead.';
		}
	}
	registerModule.call(viewsBuilder, viewName);

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
	resetPage: viewsBuilder.commit(() => Object.values(moduleCache).forEach(m => m.actions.page(0)), 'resetPage'),
	resetViewGroup: viewsBuilder.commit(() => Object.values(moduleCache).forEach(m => m.actions.viewGroup(null)), 'resetViewGroup'),
	resetAllViews: viewsBuilder.commit((state, props: {resetGroupBy: boolean}) => Object.values(moduleCache).forEach(m => m.actions.reset(props)), 'reset'),
	replaceView: viewsBuilder.commit((_, payload: {view: string|null, data: ViewRootState}) => {
		if (payload.view) getOrCreateModule(payload.view).actions.replace(payload.data);
	}, 'replaceResultsView'),
};

const get = {

}

const init = () => {
	getOrCreateModule('hits');
	getOrCreateModule('docs');
};

type ViewModule = ReturnType<typeof createViewModule>;

export {
	ViewRootState,
	ModuleRootState,
	ViewModule,
	init,
	getOrCreateModule,
	actions,
	get,
	initialState,
	initialViewState
}