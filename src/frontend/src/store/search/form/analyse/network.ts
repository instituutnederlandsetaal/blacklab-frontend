/*
 * Storage of relevant information for network pages
*/

import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';
import {RootState} from '@/store/search/';
import { stopwords } from '@/store/search/form/analyse/stopword';

type ModuleRootState = {
	stopwords: {
		value: string;
	};

	scope: {
		value: "sentence" | "paragraph" | "document";
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

    weightThreshold: {
        minSize: number;
		size: number;
    };

    numCommunities: {
		maxSize: number;
		size: number;
	};
};

const defaults: ModuleRootState = {
	stopwords: {
		value: stopwords,
	},

    scope: {
		value: "sentence",
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

    weightThreshold: {
        minSize: 0.0,
		size: 0.1,
    },

	numCommunities: {
		maxSize: 100,
		size: 3,
	},
};

const namespace = 'network';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
	stopwords: {
		value: b.read(state => state.stopwords.value, 'stopwords_value'),
	},

	scope: {
		value: b.read(state => state.scope.value, 'scope_value'),
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

    weightThreshold: {
		size: b.read(state => state.weightThreshold.size, 'weightThreshold_size'),
		minSize: b.read(state => state.weightThreshold.minSize, 'weightThreshold_minSize'),
	},

	numCommunities: {
		size: b.read(state => state.numCommunities.size, 'numCommunities_size'),
		maxSize: b.read(state => state.numCommunities.maxSize, 'numCommunities_maxSize'),
	},
}

const actions = {
	stopwords: {
		value: b.commit((state, payload: string) => {
			state.stopwords.value = payload;
		}, 'stopwords_value'),

		reset: b.commit(state => Object.assign(state.stopwords, cloneDeep(defaults.stopwords)), 'stopwords_reset'),

		replace: b.commit((state, payload: ModuleRootState['stopwords']) => {
			Object.assign(state.stopwords, payload);
		}, 'stopwords_replace')
	},
	scope: {
		value: b.commit((state, payload: any) => {
			state.scope.value = payload;
		}, 'scope_value'),

		reset: b.commit(state => Object.assign(state.scope, cloneDeep(defaults.scope)), 'scope_reset'),

		replace: b.commit((state, payload: ModuleRootState['scope']) => {
			Object.assign(state.scope, payload);
		}, 'scope_replace')
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
    weightThreshold: {
		size: b.commit((state, payload: number) => state.weightThreshold.size = Math.max(state.weightThreshold.minSize, payload), 'weightThreshold_size'),

		reset: b.commit(state => Object.assign(state.weightThreshold, cloneDeep(defaults.weightThreshold)), 'weightThreshold_reset'),

		replace: b.commit((state, payload: ModuleRootState['weightThreshold']) => {
			Object.assign(state.weightThreshold, payload);
		}, 'weightThreshold_replace')
	},
	numCommunities: {
		size: b.commit((state, payload: number) => state.numCommunities.size = Math.min(state.numCommunities.maxSize, payload), 'numCommunities_size'),

		reset: b.commit(state => Object.assign(state.numCommunities, cloneDeep(defaults.numCommunities)), 'numCommunities_reset'),

		replace: b.commit((state, payload: ModuleRootState['numCommunities']) => {
			Object.assign(state.numCommunities, payload);
		}, 'numCommunities_replace')
	},


	replace: b.commit((state, payload: ModuleRootState) => {
		actions.stopwords.replace(payload.stopwords);
		actions.scope.replace(payload.scope);
		actions.showNumber.replace(payload.showNumber);
		actions.isCase.replace(payload.isCase);
		actions.edgeAlg.replace(payload.edgeAlg);
		actions.weightThreshold.replace(payload.weightThreshold);
		actions.numCommunities.replace(payload.numCommunities);
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
