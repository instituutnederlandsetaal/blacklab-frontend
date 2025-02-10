/**
 * Contains some state about the main search form.
 * Because there are different ways to generate a query (builder, direct text editing, n-grams, etc)
 * we need to track what the user is actually doing when a query is submitted,
 * so that we know how to construct the actual query that's sent to blacklab.
 */
import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';

import {RootState} from '@/store/';
import {ModuleRootState as PatternModuleRootState} from '@/store/form/patterns';
import {ModuleRootState as ExploreModuleRootState} from '@/store/form/explore';
import { NormalizedIndex } from '@/types/apptypes';
import { CorpusChange } from '@/store/async-loaders';

type ModuleRootState = {
	form: 'search'|'explore';
	patternMode: keyof PatternModuleRootState;
	exploreMode: keyof ExploreModuleRootState;
	viewedResults: null|string;
};

const defaults: ModuleRootState = {
	form: 'search',
	patternMode: 'simple',
	exploreMode: 'corpora',
	viewedResults: null,
};

const namespace = 'interface';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults)); // copy so we don't add listeners to defaults
const getState = b.state();

const get = {
	form: b.read(state => state.form, 'form'),
	patternMode: b.read(state => state.patternMode, 'patternMode'),
	exploreMode: b.read(state => state.exploreMode, 'exploreMode'),
	viewedResults: b.read(state => state.viewedResults, 'viewedResults'),
};

const actions = {
	form: b.commit((state, payload: ModuleRootState['form']) => state.form = payload, 'form'),
	patternMode: b.commit((state, payload: ModuleRootState['patternMode']) => state.patternMode = payload, 'patternMode'),
	exploreMode: b.commit((state, payload: ModuleRootState['exploreMode']) => state.exploreMode = payload, 'exploreMode'),
	viewedResults: b.commit((state, payload: ModuleRootState['viewedResults']) => state.viewedResults = payload, 'viewedResults'),

	reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
	replace: b.commit((state, payload: ModuleRootState) => Object.assign(state, payload), 'replace'),
};

const init = (state: CorpusChange)=> {
	actions.reset();
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
