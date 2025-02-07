/*
 * Storage of relevant information for cooccur pages
*/

import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';
import {RootState} from '@/store/search/';
import { stopwords } from '@/store/search/form/analyse/stopword';

type ModuleRootState = {
	keywords: {
		value: string;
	};

	stopwords: {
		value: string;
	};

    showNumber: {
		maxSize: number;
		size: number;
	};

    isCase: {
        value: boolean;
    };

	edgeAlg: {
		value: "Jaccard" | "Simpson";
	};
};

const defaults: ModuleRootState = {
	keywords: {
		value: "",
	},

	stopwords: {
		value: stopwords,
	},

    showNumber: {
		maxSize: 100,
		size: 10,
	},

    isCase: {
        value: false,
    },

	edgeAlg: {
		value: "Jaccard",
	},
};

const namespace = 'cooccur';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
	keywords: {
		value: b.read(state => state.keywords.value, 'keywords_value'),
	},

	stopwords: {
		value: b.read(state => state.stopwords.value, 'stopwords_value'),
	},

	showNumber: {
		size: b.read(state => state.showNumber.size, 'showNumber_size'),
		maxSize: b.read(state => state.showNumber.maxSize, 'showNumber_maxSize'),
	},

	isCase: {
		value: b.read(state => state.isCase.value, 'isCase_value'),
	},

	edgeAlg: {
		value: b.read(state => state.edgeAlg.value, 'edgeAlg_value'),
	},
}

const actions = {
	keywords: {
		value: b.commit((state, payload: string) => {
			state.keywords.value = payload;
		}, 'keywords_value'),

		reset: b.commit(state => Object.assign(state.keywords, cloneDeep(defaults.keywords)), 'keywords_reset'),

		replace: b.commit((state, payload: ModuleRootState['keywords']) => {
			Object.assign(state.keywords, payload);
		}, 'keywords_replace')
	},
	stopwords: {
		value: b.commit((state, payload: string) => {
			state.stopwords.value = payload;
		}, 'stopwords_value'),

		reset: b.commit(state => Object.assign(state.stopwords, cloneDeep(defaults.stopwords)), 'stopwords_reset'),

		replace: b.commit((state, payload: ModuleRootState['stopwords']) => {
			Object.assign(state.stopwords, payload);
		}, 'stopwords_replace')
	},
	showNumber: {
		size: b.commit((state, payload: number) => state.showNumber.size = Math.min(state.showNumber.maxSize, payload), 'showNumber_size'),

		reset: b.commit(state => Object.assign(state.showNumber, cloneDeep(defaults.showNumber)), 'showNumber_reset'),

		replace: b.commit((state, payload: ModuleRootState['showNumber']) => {
			Object.assign(state.showNumber, payload);
		}, 'showNumber_replace')
	},
	isCase: {
		value: b.commit((state, payload: boolean) => {
			state.isCase.value = payload;
		}, 'isCase_value'),

		reset: b.commit(state => Object.assign(state.isCase, cloneDeep(defaults.isCase)), 'isCase_reset'),

		replace: b.commit((state, payload: ModuleRootState['isCase']) => {
			Object.assign(state.isCase, payload);
		}, 'isCase_replace')
	},

	edgeAlg: {
		value: b.commit((state, payload: any) => {
			state.edgeAlg.value = payload;
		}, 'edgeAlg_value'),

		reset: b.commit(state => Object.assign(state.edgeAlg, cloneDeep(defaults.edgeAlg)), 'edgeAlg_reset'),

		replace: b.commit((state, payload: ModuleRootState['edgeAlg']) => {
			Object.assign(state.edgeAlg, payload);
		}, 'edgeAlg_replace')
	},


	replace: b.commit((state, payload: ModuleRootState) => {
		actions.stopwords.replace(payload.stopwords);
		actions.keywords.replace(payload.keywords);
		actions.showNumber.replace(payload.showNumber);
		actions.isCase.replace(payload.isCase);
		actions.edgeAlg.replace(payload.edgeAlg);
	}, 'replace'),
	reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
};

const init = () => {
	actions.reset();
}

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults,
};
