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
	form: 'search'|'explore'|'analyse';
	patternMode: keyof PatternModuleRootState;
	exploreMode: keyof ExploreModuleRootState;
	analyseMode: 'topic'|'wordlist'|'keyword'|'collocation'|'cooccur'|'network';
	viewedResults: null|string;
};

const defaults: ModuleRootState = {
	form: 'search',
	patternMode: 'simple',
	exploreMode: 'corpora',
	analyseMode: 'topic',
	viewedResults: null,
};

const namespace = 'interface';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults)); // copy so we don't add listeners to defaults
const getState = b.state();

const get = {
	form: b.read(state => state.form, 'form'),
	patternMode: b.read(state => state.patternMode, 'patternMode'),
	exploreMode: b.read(state => state.exploreMode, 'exploreMode'),
	analyseMode: b.read(state => state.analyseMode, 'analyseMode'),
	viewedResults: b.read(state => state.viewedResults, 'viewedResults'),
};

const actions = {
	form: b.commit((state, payload: ModuleRootState['form']) => state.form = payload, 'form'),
	patternMode: b.commit((state, payload: ModuleRootState['patternMode']) => state.patternMode = payload, 'patternMode'),
	exploreMode: b.commit((state, payload: ModuleRootState['exploreMode']) => state.exploreMode = payload, 'exploreMode'),
	analyseMode: b.commit((state, payload: ModuleRootState['analyseMode']) => state.analyseMode = payload, 'analyseMode'),
	viewedResults: b.commit((state, payload: ModuleRootState['viewedResults']) => state.viewedResults = payload, 'viewedResults'),

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
