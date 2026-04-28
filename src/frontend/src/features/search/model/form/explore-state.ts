/**
 * Contains the current ui state for n-gram form.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import type { CorpusChange } from '@/_new/entities/corpus-data-from-id';
import * as UIStore from '@/app/state/ui-state';
import { memoize } from '@/features/search/model/form/reactive-store';
import { escapeRegex } from '@/utils';
import { reactive, ref } from 'vue';

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
		groupDisplayMode: 'table'
	}
};

const state = reactive(structuredClone(defaults));
const getState = () => state;

const createDefaultToken = (): Token => ({
	id: UIStore.getState().explore.defaultSearchAnnotationId,
	value: '',
});

const normalizeNgramState = () => {
	state.ngram.size = Math.min(state.ngram.size, state.ngram.maxSize);
	state.ngram.tokens = state.ngram.tokens.slice(0, state.ngram.maxSize);
	while (state.ngram.tokens.length < state.ngram.maxSize) {
		state.ngram.tokens.push(createDefaultToken());
	}
};

const get = {
	ngram: {
		size: () => state.ngram.size,
		maxSize: () => state.ngram.maxSize,
		tokens: () => state.ngram.tokens,
		groupAnnotationId: () => state.ngram.groupAnnotationId,

		groupBy: memoize(() => `hit:${state.ngram.groupAnnotationId}`),
		patternString: memoize(() => state.ngram.tokens
			.slice(0, state.ngram.size)
			.map(({id, value}) => id && value ? `[${id}="${escapeRegex(value, {escapePipes: false, escapeWildcards: false})}"]` : '[]')
			.join('')
		),
	},

	frequency: {
		annotationId: () => state.frequency.annotationId,
		patternString: () => '[]',
		groupBy: memoize(() => `hit:${state.frequency.annotationId}`)
	},

	corpora: {
		groupBy: () => state.corpora.groupBy,
		groupDisplayMode: () => state.corpora.groupDisplayMode,
	}
};

const actions = {
	ngram: {
		size: (payload: number) => state.ngram.size = Math.min(state.ngram.maxSize, payload),
		token: (payload: { index: number, token: Partial<Token> }) => {
			if (payload.index < state.ngram.maxSize) {
				const storeValue = state.ngram.tokens[payload.index];
				Object.assign(storeValue, payload.token);
				if (!storeValue.id) {
					storeValue.id = defaults.ngram.groupAnnotationId;
				}
			}
		},
		groupAnnotationId: (payload: string) => state.ngram.groupAnnotationId = payload,
		maxSize: (payload: number) => {
			state.ngram.maxSize = payload;
			normalizeNgramState();
		},

		reset: () => {
			Object.assign(state.ngram, structuredClone(defaults.ngram));
			normalizeNgramState();
		},

		replace: (payload: ModuleRootState['ngram']) => {
			Object.assign(state.ngram, payload);
			normalizeNgramState();
		},
	},

	frequency: {
		annotationId: (payload: string) => state.frequency.annotationId = payload,

		reset: () => Object.assign(state.frequency, structuredClone(defaults.frequency)),
		replace: (payload: ModuleRootState['frequency']) => Object.assign(state.frequency, payload),
	},

	corpora: {
		groupBy: (payload: string) => state.corpora.groupBy = payload,
		groupDisplayMode: (payload: string) => state.corpora.groupDisplayMode = payload,

		reset: () => Object.assign(state.corpora, structuredClone(defaults.corpora)),
		replace: (payload: ModuleRootState['corpora']) => Object.assign(state.corpora, payload),
	},

	replace: (payload: ModuleRootState) => {
		actions.corpora.replace(payload.corpora);
		actions.frequency.replace(payload.frequency);
		actions.ngram.replace(payload.ngram);
	},
	reset: () => {
		Object.assign(state, structuredClone(defaults));
		normalizeNgramState();
		resetSignal.value++;
	},
};

const resetSignal = ref(0);

const init = (_state: CorpusChange) => {
	actions.reset();
};

export { actions, defaults, get, getState, init, resetSignal };
export type { ModuleRootState, Token };

