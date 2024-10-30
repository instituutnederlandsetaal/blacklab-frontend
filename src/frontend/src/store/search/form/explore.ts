/**
 * Contains the current ui state for n-gram form.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */
import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';

import {RootState} from '@/store/search/';
import * as UIStore from '@/store/search/ui'; // Is initialized before we are.
import {escapeRegex} from '@/utils';

type Token = {
	/** Annotation ID */
	id: string;
	/** Raw value in the input */
	value: string;
};

type ModuleRootState = {
	ngram: {
		maxSize: number;
		size: number;
		tokens: Token[];
		groupAnnotationId: string;
	};

	frequency: {
		annotationId: string;
	};

	/** When the form is submitted this is copied to the DocsStore */
	corpora: {
		groupBy: string;
		groupDisplayMode: string;
	};
};

// NOTE: This state shape is invalid, we correct it on store initialization
// We need some references to the UI store, which is not initialized yet.
const defaults: ModuleRootState = {
	ngram: {
		/** 1-indexed */
		maxSize: 5,
		/** 1-indexed */
		size: 5,
		get tokens() {
			const ret: ModuleRootState['ngram']['tokens'] = [];
			for (let i = 0; i < defaults.ngram.maxSize; ++i) {
				ret.push({
					id: UIStore.getState().explore.defaultSearchAnnotationId,
					value: ''
				});
			}
			return ret;
		},
		get groupAnnotationId() { return UIStore.getState().explore.defaultGroupAnnotationId; }
	},

	frequency: {
		get annotationId() { return UIStore.getState().explore.defaultGroupAnnotationId; }
	},

	corpora: {
		get groupBy() { return `field:${UIStore.getState().explore.defaultGroupMetadataId}`; },
		// TODO
		groupDisplayMode: 'table'
	}
};

const namespace = 'explore';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
	ngram: {
		size: b.read(state => state.ngram.size, 'ngram_size'),
		maxSize: b.read(state => state.ngram.maxSize, 'ngram_maxSize'),
		tokens: b.read(state => state.ngram.tokens, 'ngram_tokens'),
		groupAnnotationId: b.read(state => state.ngram.groupAnnotationId, 'ngram_groupAnnotationId'),

		groupBy: b.read(state => `hit:${state.ngram.groupAnnotationId}`, 'ngram_groupBy'),
		patternString: b.read(state => state.ngram.tokens
			.slice(0, state.ngram.size)
			.map(({id, value}) => id && value ? `[${id}="${escapeRegex(value, {escapePipes: false, escapeWildcards: false})}"]` : '[]')
			.join('')
		, 'ngram_patternString')
	},

	frequency: {
		annotationId: b.read(state => state.frequency.annotationId, 'frequency_annotationId'),
		patternString: b.read(() => '[]', 'frequency_patternString'), // always search for all tokens.
		groupBy: b.read(state => `hit:${state.frequency.annotationId}`, 'frequency_groupBy')
	},

	corpora: {
		groupBy: b.read(state => state.corpora.groupBy, 'corpora_groupBy'),
		groupDisplayMode: b.read(state => state.corpora.groupDisplayMode, 'corpora_groupDisplayMode'),
	}
};

const internalActions = {
	fixTokenArray: b.commit(state => {
		const id = UIStore.getState().explore.defaultSearchAnnotationId;
		state.ngram.tokens = state.ngram.tokens.slice(0, state.ngram.maxSize);
		while (state.ngram.tokens.length < state.ngram.maxSize) {
			state.ngram.tokens.push({
				id,
				value: '',
			});
		}
	}, 'fixTokenArray')
};

const actions = {
	ngram: {
		size: b.commit((state, payload: number) => state.ngram.size = Math.min(state.ngram.maxSize, payload), 'ngram_size'),
		token: b.commit((state, payload: { index: number, token: Partial<Token> }) => {
			if (payload.index < state.ngram.maxSize) {
				const storeValue = state.ngram.tokens[payload.index];
				Object.assign(storeValue, payload.token);
				if (!storeValue.id) {
					storeValue.id = defaults.ngram.groupAnnotationId;
				}
			}
		}, 'ngram_token'),
		groupAnnotationId: b.commit((state, payload: string) => state.ngram.groupAnnotationId = payload, 'ngram_groupAnnotationId'),
		maxSize: b.commit((state, payload: number) => {
			state.ngram.size = Math.min(state.ngram.size, payload);
			state.ngram.tokens = state.ngram.tokens.slice(0, payload);
			internalActions.fixTokenArray();
		}, 'ngram_maxSize'),

		// clone required so we don't insert a the default array and subsequent changes don't write back into it
		reset: b.commit(state => Object.assign(state.ngram, cloneDeep(defaults.ngram)), 'ngram_reset'),

		replace: b.commit((state, payload: ModuleRootState['ngram']) => {
			Object.assign(state.ngram, payload);
			internalActions.fixTokenArray(); // for when new token array doesn't match maximum length
		}, 'ngram_replace')
	},

	frequency: {
		annotationId: b.commit((state, payload: string) => state.frequency.annotationId = payload, 'frequency_annotationId'),

		reset: b.commit(state => Object.assign(state.frequency, defaults.frequency) , 'frequency_reset'),
		replace: b.commit((state, payload: ModuleRootState['frequency']) => Object.assign(state.frequency, payload), 'frequency_replace'),
	},

	corpora: {
		groupBy: b.commit((state, payload: string) => state.corpora.groupBy = payload, 'corpora_groupBy'),
		groupDisplayMode: b.commit((state, payload: string) => state.corpora.groupDisplayMode = payload, 'corpora_groupDisplayMode'),

		reset: b.commit(state => Object.assign(state.corpora, defaults.corpora), 'corpora_reset'),
		replace: b.commit((state, payload: ModuleRootState['corpora']) => Object.assign(state.corpora, payload), 'corpora_replace'),
	},

	replace: b.commit((state, payload: ModuleRootState) => {
		actions.corpora.replace(payload.corpora);
		actions.frequency.replace(payload.frequency);
		actions.ngram.replace(payload.ngram);
	}, 'replace'),
	reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
};

const init = () => {
	actions.reset();
};

export {
	ModuleRootState,
	Token,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults,
};
