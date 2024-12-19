// gedoe ... de patternStore (src/store/search/form/patterns.ts) is een goed voorbeeldje want redelijk simpel
// Zie https://github.com/mrcrowl/vuex-typex/blob/master/src/index.ts voor de gebruikte ts implementatie

import { getStoreBuilder } from 'vuex-typex';

import { RootState } from '@/store/';
import * as PatternStore from '@/store/form/patterns';
import { uniq } from '@/utils'
import cloneDeep from 'clone-deep';

import { init as initConceptEndpoint, conceptApi } from '@/api';
import Vue from 'vue';

type Settings = {
	/** guaranteed not to end in '/' */
	concept_server: string,
	/** Which lexicon inside the concept_server. quine_lexicon in our demo. */
	instance: string,

	/** For sending to the back-end of the concept/blackparank stuff. Should live in backend config probably. */
	blacklab_server: string,
	lexit_server: string,
	lexit_instance: string,
	searchable_elements: string[]
}

type AtomicQuery = {
	field: string;
	value: string;
};

type ModuleRootState = {
	/** If not set, the concept component is not active. */
	settings: Settings|null,

	target_element: string;
	main_fields: string[]
	query_cql: string;
	/** One AtomicQuery[] per search box (based on index) */
	query: AtomicQuery[][]
};

/** Only that part of the state that makes sense to persist in query history. */
type HistoryState = Omit<ModuleRootState, 'settings'>;

type LexiconEntry = {
	field: string,
	cluster: string,
	term: string
}

const defaults: HistoryState = {
	target_element: '',
	main_fields: [],
	query_cql: '',
	query: [[], []] // start with two boxes
}

const namespace = 'concepts';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep({...defaults, settings: null}));

const getState = b.state();

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = () => { /* */ }



/** TODO align query in store and in query parameters so we can just pass it along as-is. */
function reshuffle_query_for_blackparank(q: AtomicQuery[][], element: string): {element: string, strict: boolean, filter: string, queries: Record<string, AtomicQuery[]>} {
	// remove the nesting of terms.
	return {
		element,
		strict: true,
		filter: '',
		queries: q.reduce((acc, val, i) => {
			acc[i] = val;
			return acc;
		}, {} as Record<string, AtomicQuery[]>)
	}
}

/////////////////////////////////////////////////////////////////////////////////////////////
// getters and actions
/////////////////////////////////////////////////////////////////////////////////////////////

const get = {
	query_cql: b.read(s => s.query_cql, 'query_cql'),
	settings: b.read(s => s.settings, 'settings'),
	main_fields: b.read(s => s.main_fields, 'main_fields'),
	/** Get the query for use with the backend if valid, otherwise null. */
	query_for_blackparank: b.read(s => {
		let hasValidQuery = false;
		const r: Record<string, AtomicQuery[]> = {};
		for (let i = 0; i < s.query.length; i++) {
			const q = s.query[i];
			const thisQueryIsValid = q.some(qq => qq.value);
			if (thisQueryIsValid) {
				hasValidQuery = true;
				r['b' + i] = q.filter(qq => qq.value);
			}
		}
		return hasValidQuery ? r : null;
	}, 'atomic_query'),
};

const actions = {
	reset: b.commit(state => Object.assign<ModuleRootState, HistoryState>(state, cloneDeep(defaults)), 'reset'),
	replace: b.commit((state, payload: HistoryState) => Object.assign(state, payload), 'replace_query'),

	addSubquery: b.commit((state, payload: AtomicQuery[] = []) => {
		state.query.push(payload);
		actions.updateCQL();
	}, 'add_subquery'),
	removeSubquery: b.commit((state, payload?: number) => {
		payload = payload ?? state.query.length - 1;
		state.query.splice(payload, 1);
		actions.updateCQL();
	}, 'remove_subquery'),
	updateSubquery: b.commit((state, payload: {index: number, query: AtomicQuery[]}) => {
		// Use Vue.set to make sure the change is recorded, otherwise it won't be detected by Vue.
		// this can be removed when we switch to Vue 3.
		Vue.set(state.query, payload.index, payload.query);
		actions.updateCQL();
	}, 'update_subquery'),

	updateCQL: b.commit(s => {
		const query = get.query_for_blackparank();
		if (!query || !s.settings) return;
		conceptApi
			.translate_query_to_cql(s.settings.blacklab_server, INDEX_ID, s.target_element, query)
			.then(r => {
				s.query_cql = r.pattern;
				PatternStore.actions.concept(s.query_cql);
			})
			.catch(e => alert(`setSubQuery: ${e.message}}`))
	}, 'concept_update_cql'),

	setTargetElement: b.commit((state, payload: string) => {
		 state.target_element = payload
		 actions.updateCQL()
	}, 'concept_set_target_element'),

	loadSettings: b.commit((state, payload: Settings) => {
		state.settings = payload;
		state.settings.blacklab_server = (state.settings.blacklab_server || BLS_URL).replace(/\/$/, '');
		state.settings.concept_server = state.settings.concept_server.replace(/\/$/, '');
		initConceptEndpoint('concept', state.settings.concept_server, null);

		conceptApi.getMainFields(state.settings.instance, INDEX_ID)
			.then(response => state.main_fields = uniq(response.data.map(x => x.field)));
	}, 'concept_load_settings'),
};

export {
	ModuleRootState,
	HistoryState,
	AtomicQuery,
	LexiconEntry,
	Settings,

	namespace,
	defaults,
	actions,
	getState,
	get,
	init,
}
