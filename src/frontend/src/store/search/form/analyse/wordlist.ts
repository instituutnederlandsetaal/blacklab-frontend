/**
 * Storage of relevant information for wordlist pages
 */
import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';
import {RootState} from '@/store/search/';
import { stopwords } from '@/store/search/form/analyse/stopword';

type ModuleRootState = {
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

    dispersionAlg: {
        value: "None" | "Carroll's D₂" | "Gries's DP" | "Juilland's D" | "Lyne's D₃" | "Rosengren's S"| "Zhang's Distributional Consistency"| "Average Logarithmic Distance" | "Average Reduced Frequency" | "Average Waiting Time";
    };

    adjustedAlg: {
        value: "None" | "Carroll's Uₘ" | "Engwall's FM" | "Juilland's U" | "Kromer's UR" | "Rosengren's KF" | "Average Logarithmic Distance" | "Average Reduced Frequency" | "Average Waiting Time";
    };
    
    // partN shows in page when dispersionAlg or adjustedAlg need the "partN" parameter.
    partN: {
		maxSize: number;
		size: number;
	};
};

const defaults: ModuleRootState = {
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

    dispersionAlg: {
        value: "None",
    },

    adjustedAlg: {
        value: "None",
    },

    partN: {
        maxSize: 20,
        size: 5,
    },	
};

const namespace = 'wordlist';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
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

    dispersionAlg: {
        value: b.read(state => state.dispersionAlg.value, 'dispersionAlg_value'),
    },

    adjustedAlg: {
        value: b.read(state => state.adjustedAlg.value, 'adjustedAlg_value'),
    },

    partN: {
        size: b.read(state => state.partN.size, 'partN_size'),
        maxSize: b.read(state => state.partN.maxSize, 'partN_maxSize'),
    },
};

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

    showNumber: {
        size: b.commit((state, payload: number) => {
            state.showNumber.size = Math.min(state.showNumber.maxSize, payload);
        }, 'showNumber_size'),

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

    dispersionAlg: {
        value: b.commit((state, payload: any) => {
            state.dispersionAlg.value = payload;
        }, 'dispersionAlg_value'),

        reset: b.commit(state => Object.assign(state.dispersionAlg, cloneDeep(defaults.dispersionAlg)), 'dispersionAlg_reset'),

        replace: b.commit((state, payload: ModuleRootState['dispersionAlg']) => {
            Object.assign(state.dispersionAlg, payload);
        }, 'dispersionAlg_replace')
    },

    adjustedAlg: {
        value: b.commit((state, payload: any) => {
            state.adjustedAlg.value = payload;
        }, 'adjustedAlg_value'),

        reset: b.commit(state => Object.assign(state.adjustedAlg, cloneDeep(defaults.adjustedAlg)), 'adjustedAlg_reset'),

        replace: b.commit((state, payload: ModuleRootState['adjustedAlg']) => {
            Object.assign(state.adjustedAlg, payload);
        }, 'adjustedAlg_replace')
    },

    partN: {
        size: b.commit((state, payload: number) => {
            state.partN.size = Math.min(state.partN.maxSize, payload);
        }, 'partN_size'),

        reset: b.commit(state => Object.assign(state.partN, cloneDeep(defaults.partN)), 'partN_reset'),

        replace: b.commit((state, payload: ModuleRootState['partN']) => {
            Object.assign(state.partN, payload);
        }, 'partN_replace')
    },

    replace: b.commit((state, payload: ModuleRootState) => {
        actions.stopwords.replace(payload.stopwords);
        actions.showNumber.replace(payload.showNumber);
        actions.isCase.replace(payload.isCase);
        actions.dispersionAlg.replace(payload.dispersionAlg);
        actions.adjustedAlg.replace(payload.adjustedAlg);
        actions.partN.replace(payload.partN);
    }, 'replace'),
    reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
};

const init = () => {
	actions.reset();
};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults,
};
