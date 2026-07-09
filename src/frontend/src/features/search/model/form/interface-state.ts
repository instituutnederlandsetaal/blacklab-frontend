/**
 * Contains some state about the main search form.
 * Because there are different ways to generate a query (builder, direct text editing, n-grams, etc)
 * we need to track what the user is actually doing when a query is submitted,
 * so that we know how to construct the actual query that's sent to blacklab.
 */
import cloneDeep from 'clone-deep';
import { reactive } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { ModuleRootState as ExploreModuleRootState } from '@/features/search/model/form/explore-state';
import type { PatternMode } from '@/features/search/model/form/pattern-state';

type ModuleRootState = {
	form: 'search' | 'explore';
	patternMode: PatternMode;
	exploreMode: keyof ExploreModuleRootState;
	viewedResults: null | string;
	activeAnnotationTab: null | string;
	activeFilterTab: null | string;
};

const defaults: ModuleRootState = {
	form: 'search',
	patternMode: 'simple',
	exploreMode: 'corpora',
	viewedResults: null,
	activeAnnotationTab: null,
	activeFilterTab: null,
};

const state = reactive(structuredClone(defaults));
const getState = () => state;

const get = {
	form: () => state.form,
	patternMode: () => state.patternMode,
	exploreMode: () => state.exploreMode,
	viewedResults: () => state.viewedResults,
	activeAnnotationTab: () => state.activeAnnotationTab,
	activeFilterTab: () => state.activeFilterTab,
};

const actions = {
	form: (payload: ModuleRootState['form']) => (state.form = payload),
	patternMode: (payload: ModuleRootState['patternMode']) => (state.patternMode = payload),
	exploreMode: (payload: ModuleRootState['exploreMode']) => (state.exploreMode = payload),
	viewedResults: (payload: ModuleRootState['viewedResults']) => (state.viewedResults = payload),
	activeAnnotationTab: (payload: ModuleRootState['activeAnnotationTab']) => (state.activeAnnotationTab = payload),
	activeFilterTab: (payload: ModuleRootState['activeFilterTab']) => (state.activeFilterTab = payload),

	reset: () => Object.assign(state, cloneDeep(defaults)),
	replace: (payload: ModuleRootState) => Object.assign(state, payload),
};

const init = (_state: CorpusContext) => {
	actions.reset();
};

export { actions, defaults, get, getState, init };
export type { ModuleRootState };
