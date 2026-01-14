/**
 * Contains some state about the main search form.
 * Because there are different ways to generate a query (builder, direct text editing, n-grams, etc)
 * we need to track what the user is actually doing when a query is submitted,
 * so that we know how to construct the actual query that's sent to blacklab.
 */
import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';

import {RootState} from '@/store/search/';
import {ModuleRootState as PatternModuleRootState} from '@/store/search/form/patterns';
import {ModuleRootState as ExploreModuleRootState} from '@/store/search/form/explore';

type ModuleRootState = {
	form: 'search'|'explore';
	patternMode: keyof PatternModuleRootState;
	exploreMode: keyof ExploreModuleRootState;
	viewedResults: null|string;
	activeAnnotationTab: null|string; // Active subtab in Extended search tab
	activeFilterTab: null|string; // Active tab in Filters section
};

const defaults: ModuleRootState = {
	form: 'search',
	patternMode: 'simple',
	exploreMode: 'corpora',
	viewedResults: null,
	activeAnnotationTab: null,
	activeFilterTab: null,
};

const namespace = 'interface';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults)); // copy so we don't add listeners to defaults
const getState = b.state();

const get = {
	form: b.read(state => state.form, 'form'),
	patternMode: b.read(state => state.patternMode, 'patternMode'),
	exploreMode: b.read(state => state.exploreMode, 'exploreMode'),
	viewedResults: b.read(state => state.viewedResults, 'viewedResults'),
	activeAnnotationTab: b.read(state => state.activeAnnotationTab, 'activeAnnotationTab'),
	activeFilterTab: b.read(state => state.activeFilterTab, 'activeFilterTab'),
};

const actions = {
	form: b.commit((state, payload: ModuleRootState['form']) => state.form = payload, 'form'),
	patternMode: b.commit((state, payload: ModuleRootState['patternMode']) => state.patternMode = payload, 'patternMode'),
	exploreMode: b.commit((state, payload: ModuleRootState['exploreMode']) => state.exploreMode = payload, 'exploreMode'),
	viewedResults: b.commit((state, payload: ModuleRootState['viewedResults']) => state.viewedResults = payload, 'viewedResults'),
	activeAnnotationTab: b.commit((state, payload: ModuleRootState['activeAnnotationTab']) => state.activeAnnotationTab = payload, 'activeAnnotationTab'),
	activeFilterTab: b.commit((state, payload: ModuleRootState['activeFilterTab']) => state.activeFilterTab = payload, 'activeFilterTab'),

	reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
	replace: b.commit((state, payload: ModuleRootState) => Object.assign(state, payload), 'replace'),
};

const init = () => {/**/};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
