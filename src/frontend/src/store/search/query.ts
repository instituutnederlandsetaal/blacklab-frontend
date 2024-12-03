/**
 * This module contains the currently active query.
 * It's updated whenever the user actually submits a query by pressing search/submit on the main form or any of the explore forms.
 * It's essentially a snapshot of the filters and pattern as they were when the form was submitted.
 *
 * It doesn't only store the pattern and filters though,
 * it also contains some information about what part of the search/explore form the query was submitted from.
 * This is so that we can in turn store this in the query history and url,
 * and in turn restore the way the form looks when the user loads an old query through one of those mechanisms.
 *
 * If we were to only store the blacklab query parameters, we don't know whether the
 * query was generated in, for example, the n-gram editor or the querybuilder.
 * (It's very possible to create the same query through both those mechanisms and more).
 *
 * Generally, this part of the state ends up in the query history,
 * and the less processing we do here (such as turning annotations in a normal cql query string, or turning filters into a normal lucene query string)
 * the less work we have to do to undo this when the user loads that same history entry later.
 *
 * In order to generate a complete blacklab query, it is combined with the global settings (page size, sampling, context size, etc)
 * and the results settings (the grouping, viewed page number, etc).
 */

import cloneDeep from 'clone-deep';
import {getStoreBuilder} from 'vuex-typex';

import {RootState} from '@/store/search/';
import * as CorpusModule from '@/store/search/corpus';
import * as PatternModule from '@/store/search/form/patterns';
import * as FilterModule from '@/store/search/form/filters';
import * as ExploreModule from '@/store/search/form/explore';
import * as GapModule from '@/store/search/form/gap';
import { getFilterSummary, getFilterString } from '@/components/filters/filterValueFunctions';
import { getPatternStringExplore, getPatternStringSearch, getPatternSummaryExplore, getPatternSummarySearch } from '@/utils';

// todo migrate these weirdo state shapes to mapped types?
// might be a cleaner way of doing this...
// weird template parameter is just a way to avoid having to write out all permutations of the subForm type.
// (which is any of the root state keys of the pattern module)
// basically we just want "one of" the entries in the pattern module root state.
type ModuleRootStateSearch<K extends keyof PatternModule.ModuleRootState> = {
	form: 'search';
	subForm: K;

	formState: PatternModule.ModuleRootState[K];
	parallelFields: PatternModule.ModuleRootState['parallelFields'];
	filters: FilterModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
};

type ModuleRootStateExplore<K extends keyof ExploreModule.ModuleRootState> = {
	form:'explore';
	subForm: K;

	formState: ExploreModule.ModuleRootState[K];
	parallelFields: PatternModule.ModuleRootState['parallelFields'];
	filters: FilterModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
};

type ModuleRootStateNone = {
	form: null;
	subForm: null;
	formState: null;
	parallelFields: null;
	filters: null;
	gap: null;
};

type ModuleRootState = ModuleRootStateNone|ModuleRootStateSearch<keyof PatternModule.ModuleRootState>|ModuleRootStateExplore<keyof ExploreModule.ModuleRootState>;

const initialState: ModuleRootStateNone = {
	form: null,
	subForm: null,
	formState: null,
	parallelFields: null,
	filters: null,
	gap: null
};

const namespace = 'query';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, Object.assign({}, initialState));
const getState = b.state();

const get = {
	/**
	 * Return the sourceField of the query.
	 * We only return a value here for parallel corpora.
	 * In all other cases, we let BlackLab decide the main search field.
	 * (In practice it will be the mainAnnotatedField)
	 */
	annotatedFieldName: b.read((state): string|undefined => {
		switch (state.form) {
			case 'search': return state.parallelFields.source || undefined;
			case 'explore': return undefined; // always use default field.
			default: return undefined;
		}
	}, 'annotatedFieldName'),
	patternString: b.read((state, getters, rootState): string|undefined => {
		if (!state.subForm) return undefined;

		const formState = {
			[state.subForm as string]: state.formState,
			parallelFields: state.parallelFields,
		} as Partial<ModuleRootStateSearch<keyof PatternModule.ModuleRootState>>; /** egh, feel free to refactor */
		const annotations = CorpusModule.get.allAnnotationsMap();
		switch (state.form) {
		case 'search':
			return getPatternStringSearch(state.subForm, formState as any, rootState.ui.search.shared.alignBy.defaultValue);
		case 'explore':
			return getPatternStringExplore(state.subForm, formState as any, annotations);
		default:
			return undefined;
		}
	},
	'patternString'),
	/** Human-readable version of the query for use in history, summaries, etc. */
	patternSummary: b.read((state, getters, rootState): string|undefined => {
		const formState = {
			[state.subForm as string]: state.formState,
			parallelFields: state.parallelFields,
		} as any; /** egh, feel free to refactor */
		switch (state.form) {
		case 'search':
			return getPatternSummarySearch(state.subForm, formState, rootState.ui.search.shared.alignBy.defaultValue);
		case 'explore':
			return getPatternSummaryExplore(state.subForm, formState, CorpusModule.get.allAnnotationsMap());
		default:
			return undefined;
		}
	}, 'patternSummary'),
	filterString: b.read((state): string|undefined => {
		if (!state.form) { return undefined; }
		return getFilterString(Object.values(state.filters).sort((a, b) => a.id.localeCompare(b.id)));
	}, 'filterString'),
	filterSummary: b.read((state): string|undefined => {
		if (!state.form) { return undefined; }
		return getFilterSummary(Object.values(state.filters).sort((a, b) => a.id.localeCompare(b.id)));
	}, 'filterSummary')
};

const actions = {
	// Deep copy these to prevent aliasing and the reactivity issues that come with it
	// such as writing to current state causing updates in history entries
	search: b.commit((state, payload: ModuleRootState) => Object.assign(state, cloneDeep(payload)), 'search'),

	reset: b.commit(state => Object.assign(state, Object.assign({}, initialState)), 'reset'),
	replace: b.commit((state, payload: ModuleRootState) => Object.assign(state, cloneDeep(payload)), 'replace'),
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = () => {/**/};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
};
