// gedoe ... de patternStore (src/store/search/form/patterns.ts) is een goed voorbeeldje want redelijk simpel
// Zie https://github.com/mrcrowl/vuex-typex/blob/master/src/index.ts voor de gebruikte ts implementatie

import cloneDeep from 'clone-deep';

import { getStoreBuilder } from 'vuex-typex';
import { BLHit } from '@/types/blacklabtypes';
import { RootState } from '@/store/';
import * as PatternStore from '@/store/form/patterns';

import {glossApi, init as initGlossEndpoint} from '@/api';
import Vue from 'vue';
import { debugLog } from '@/utils/debug';

type GlossFieldType = {
	 type: string,
	 values: string[]
}

type GlossFieldDescription = {
	type: GlossFieldType,
	fieldName: string
}

const BooleanField: GlossFieldType = { //{"type":"boolean","values":["","true","false"]}
	type: 'boolean',
	values: ['', 'true', 'false']
}

const JobField: GlossFieldType = { // {"type":"boolean","values":["","logic and linguistics","meanings of the preposition in","god in logic","adjective collocations of truth"]}
	type: 'boolean',
	values: ['', 'logic and linguistics', 'meanings of the preposition in', 'god in logic', 'adjective collocations of truth']
}

const StringField: GlossFieldType = { // {"type":"string","values":[]}
	type: 'string',
	values: []
}

type Gloss = {
	[key: string]: string;
}

type GlossQuery = {
	corpus: string,
	parts: { [key: string]: string; }
}

type Glossing = {
	gloss: Gloss,
	corpus: string,
	hitId: string,
	hit_first_word_id: string,
	hit_last_word_id: string
}

type Settings = {
	/** Any trailing '/' will be stripped. */
	gloss_server: string,
	/** Which lexicon inside the gloss_server. quine_lexicon in our demo. */
	instance: string,

	gloss_fields: GlossFieldDescription[],
	get_hit_id(a: BLHit): string,
	get_hit_range_id(a: BLHit): {startid: string, endid: string},
}

type ModuleRootState = {
	/** When null, this component is not active. */
	settings: Settings|null,

	glosses: Record<string, Glossing>,
	gloss_query: GlossQuery,
	gloss_query_cql: string,
	current_page: string[], // ids of hits currently visible in result display
};

/** Only that part of the state that makes sense to persist in query history. */
type HistoryState = Omit<ModuleRootState, 'settings'>;

/** Must be initialized from customjs */
const defaults: HistoryState = {
	glosses: {},
	current_page: [],
	gloss_query: {
		corpus: INDEX_ID,
		parts: {comment : ''}
	},
	gloss_query_cql: '',
}


const namespace = 'glosses';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep({...defaults, settings: null}));

const getState = b.state();
// intentionally empty, it's just there to prevent this module from being removed by tree-shake (i.e. left out during build)
const init = () => {};


/////////////////////////////////////////////////////////////////////////////////////////////
// getters and actions
/////////////////////////////////////////////////////////////////////////////////////////////

// TODO parameters in getters is not supported.
// The functions won't be reactive. (i.e. component won't re-evaluate automatically when the getter would return a different value)
const get = {
	getGloss: (h: BLHit): Glossing|undefined|null =>  {
		const state = getState()
		const hit_id = state.settings?.get_hit_id(h)
		return hit_id ? state.glosses[hit_id] : null // kan null zijn
	},
	getGlossById(hitId: string) {
		return getState().glosses[hitId]
	},
	getGlossValue(hitId: string, fieldName: string)  {
		const glosses = getState().glosses
		if (hitId in glosses) {
			const glossing: Glossing = glosses[hitId]
			const fieldValue =  glossing.gloss[fieldName];
			debugLog(`Gloss GET ${hitId} ${fieldName}=${fieldValue}`)
			return fieldValue
		}
		else return ''
	},
	getGlossQueryFieldValue(fieldName: string) { return getState().gloss_query.parts[fieldName]; },
	glossQuery: b.read(s => s.gloss_query, 'gloss_query'),
	settings: b.read(s => s.settings, 'settings'),
	gloss_fields: b.read(s => s.settings?.gloss_fields ?? [], 'gloss_fields'),
	get_hit_id_function: b.read(s => s.settings?.get_hit_id ?? null, 'get_hit_id_function'),
};

const actions = {
	reset: b.commit(state => Object.assign<ModuleRootState, HistoryState>(state, cloneDeep(defaults)), 'gloss_reset'),
	addGloss: b.commit((state, payload: {gloss: Gloss, hit: BLHit}) =>  {
		if (!state.settings) return;
		// store locally
		const range = state.settings.get_hit_range_id(payload.hit)
		const hitId = state.settings.get_hit_id(payload.hit)
		const glossing: Glossing = {
			gloss: payload.gloss,
			corpus: INDEX_ID,
			hitId,
			hit_first_word_id: range.startid,
			hit_last_word_id: range.endid
		}
		Vue.set(state.glosses, hitId, glossing);
	}, 'add_gloss'),

	addGlossing: b.commit((state, payload: Glossing) => {
		const hitId = payload.hitId
		Vue.set(state.glosses, hitId, payload);
	}, 'add_glossing'),

	setOneGlossField: b.commit((state, payload: { hitId: string, fieldName: string, fieldValue: string, hit_first_word_id: string, hit_last_word_id: string}) => {
		const {hitId, fieldName, fieldValue, hit_first_word_id, hit_last_word_id} = payload;
		debugLog(`Gloss SET ${hitId} ${fieldName}=${fieldValue}`)
		const glossing = {
			gloss: {
				...state.glosses[hitId]?.gloss,
				[fieldName]: fieldValue
			},
			corpus: INDEX_ID,
			hitId,
			hit_first_word_id,
			hit_last_word_id,
		}
		Vue.set(state.glosses, hitId, glossing);
		actions.storeToDatabase({glossings: [glossing]})
	}, `set_gloss_field_value`), // als je dit twee keer doet gaat ie mis wegens dubbele dinges...

	setQueryCql: b.commit((state, payload: string) => {state.gloss_query_cql = payload}, 'set_cql'),
	updateCQL: b.commit((state) =>  {
		if (!state.settings) return;
		const p = state.gloss_query.parts
		const validKeys = Object.keys(state.gloss_query.parts).filter(k => p[k]?.length);
		if (validKeys.length === 0) {
			state.gloss_query_cql = ''
			return
		};
		const q = validKeys.reduce<Record<string, string>>((acc, k) => { acc[k] = p[k]; return acc; }, {});
		glossApi.getCql(state.settings.instance, INDEX_ID, JSON.stringify(q))
			.then(cql => {
				actions.setQueryCql(cql);
				PatternStore.actions.glosses(state.gloss_query_cql);
			})
			.catch(e => {
				console.error(e);
				alert(e.message);
			});
	}, 'gloss_search_update_cql'),
	setOneGlossQueryField: b.commit((state, payload: {  fieldName: string, fieldValue: string })  => {
		const fieldName = payload.fieldName
		const fieldValue = payload.fieldValue
		Vue.set(state.gloss_query.parts, fieldName, fieldValue);
		// and translate query to cql......?
		//alert('Set gloss query field: ' + JSON.stringify(payload))
		actions.updateCQL()
	}, `set_gloss_queryfield_value`), // als je dit twee keer doet gaat ie mis wegens dubbele dinges...
	resetGlossQuery: b.commit((state)  => {
		state.gloss_query.parts = {}
		actions.updateCQL()
	}, `reset_gloss_query`), // als je dit twee keer doet gaat ie mis wegens dubbele dinges...

	storeToDatabase: b.commit((state, payload: {glossings: Glossing[]}) => {
		if (!state.settings) { console.error('Trying to store gloss in database, but not configured.'); return; }
		glossApi
		.storeGlosses(state.settings.instance, payload.glossings)
		.catch(e => {
			console.error(e);
			alert(e.message);
		});
	}, 'store_to_database'),
	setCurrentPage: b.commit((state, payload: string[]) => {
		if (!state.settings) { console.error('Trying to set current page, but not configured.'); return; }
		state.current_page = payload
		glossApi
			.getGlosses(state.settings.instance, INDEX_ID, payload)
			.then(glossings => glossings.forEach(actions.addGlossing))
			.catch(e => {
				console.error(e);
				alert(e.message);
			});
	}, 'set_current_page'),
	loadSettings: b.commit((state, payload: Settings) => {
		state.settings = payload
		state.settings.gloss_server = state.settings.gloss_server.replace(/\/$/, '');
		initGlossEndpoint('gloss', state.settings.gloss_server, null);
	} , 'gloss_load_settings'),
	replace: b.commit((state, payload: HistoryState) => {
		Object.assign(state, payload);
	}, 'gloss_replace'),
};

// hebben we de init nodig?
export {
	ModuleRootState,
	HistoryState,
	Gloss,
	Glossing,
	Settings,
	GlossFieldType,
	GlossFieldDescription,

	namespace,
	defaults,
	actions,
	getState,
	get,
	init,
}


