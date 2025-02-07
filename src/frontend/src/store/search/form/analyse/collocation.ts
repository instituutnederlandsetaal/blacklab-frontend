/*
 * Storage of relevant information for collocation pages
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

	aroundNumber: {
		maxSize: number;
		size: number;
	};

    showNumber: {
		maxSize: number;
		size: number;
	};

    isCase: {
        value: boolean;
    };

	testAlg: {
		value: "None" | "Fisher's Exact Test"
		| "Log-likelihood Ratio Test" | "Mann-Whitney U Test" | "Pearson's Chi-squared Test" | "Student's t-test (1-sample)" | "Student's t-test (2-sample)" | "Welch's t-test" | "z-score" | "z-score (Berry-Rogghe)";
	};

	bayesAlg: {
		value: "None" | "Log-likelihood Ratio Test" | "Student's t-test (2-sample)";
	};

	effectSizeAlg: {
		value: "None" | "%DIFF" | "Cubic Association Ratio" | "Dice's Coefficient" | "Difference Coefficient" | "Jaccard Index" | "Kilgarriff's Ratio" | "Log Ratio" | "Log-Frequency Biased MD" | "logDice" | "MI.log-f" | "Minimum Sensitivity" | "Mutual Dependency" | "Mutual Expectation" | "Mutual Information" | "Odds Ratio" |" Pointwise Mutual Information" | "Poisson Collocation Measure" | "Squared Phi Coefficient";
	};
};

const defaults: ModuleRootState = {
	keywords: {
		value: "",
	},

	stopwords: {
		value: stopwords,
	},

    aroundNumber: {
		maxSize: 50,
		size: 5,
	},

    showNumber: {
		maxSize: 100,
		size: 10,
	},

    isCase: {
        value: false,
    },

	testAlg: {
		value: "None",
	},

	bayesAlg: {
		value: "None",
	},

	effectSizeAlg: {
		value: "None",
	},
};

const namespace = 'collocation';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
	keywords: {
		value: b.read(state => state.keywords.value, 'keywords_value'),
	},

	stopwords: {
		value: b.read(state => state.stopwords.value, 'stopwords_value'),
	},

	aroundNumber: {
		size: b.read(state => state.aroundNumber.size, 'aroundNumber_size'),
		maxSize: b.read(state => state.aroundNumber.maxSize, 'aroundNumber_maxSize'),
	},

	showNumber: {
		size: b.read(state => state.showNumber.size, 'showNumber_size'),
		maxSize: b.read(state => state.showNumber.maxSize, 'showNumber_maxSize'),
	},

	isCase: {
		value: b.read(state => state.isCase.value, 'isCase_value'),
	},

	testAlg: {
		value: b.read(state => state.testAlg.value, 'testAlg_value'),
	},

	bayesAlg: {
		value: b.read(state => state.bayesAlg.value, 'bayesAlg_value'),
	},

	effectSizeAlg: {
		value: b.read(state => state.effectSizeAlg.value, 'effectSizeAlg_value'),
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
	aroundNumber: {
		size: b.commit((state, payload: number) => state.aroundNumber.size = Math.min(state.aroundNumber.maxSize, payload), 'aroundNumber_size'),

		reset: b.commit(state => Object.assign(state.aroundNumber, cloneDeep(defaults.aroundNumber)), 'aroundNumber_reset'),

		replace: b.commit((state, payload: ModuleRootState['aroundNumber']) => {
			Object.assign(state.aroundNumber, payload);
		}, 'aroundNumber_replace')
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

	testAlg: {
		value: b.commit((state, payload: any) => {
			state.testAlg.value = payload;
		}, 'testAlg_value'),

		reset: b.commit(state => Object.assign(state.testAlg, cloneDeep(defaults.testAlg)), 'testAlg_reset'),

		replace: b.commit((state, payload: ModuleRootState['testAlg']) => {
			Object.assign(state.testAlg, payload);
		}, 'testAlg_replace')
	},

	bayesAlg: {
		value: b.commit((state, payload: any) => {
			state.bayesAlg.value = payload;
		}, 'bayesAlg_value'),

		reset: b.commit(state => Object.assign(state.bayesAlg, cloneDeep(defaults.bayesAlg)), 'bayesAlg_reset'),

		replace: b.commit((state, payload: ModuleRootState['bayesAlg']) => {
			Object.assign(state.bayesAlg, payload);
		}, 'bayesAlg_replace')
	},

	effectSizeAlg: {
		value: b.commit((state, payload: any) => {
			state.effectSizeAlg.value = payload;
		}, 'effectSizeAlg_value'),

		reset: b.commit(state => Object.assign(state.effectSizeAlg, cloneDeep(defaults.effectSizeAlg)), 'effectSizeAlg_reset'),

		replace: b.commit((state, payload: ModuleRootState['effectSizeAlg']) => {
			Object.assign(state.effectSizeAlg, payload);
		}, 'effectSizeAlg_replace')
	},


	replace: b.commit((state, payload: ModuleRootState) => {
		actions.stopwords.replace(payload.stopwords);
		actions.keywords.replace(payload.keywords);
		actions.aroundNumber.replace(payload.aroundNumber);
		actions.showNumber.replace(payload.showNumber);
		actions.isCase.replace(payload.isCase);
		actions.testAlg.replace(payload.testAlg);
		actions.bayesAlg.replace(payload.bayesAlg);
		actions.effectSizeAlg.replace(payload.effectSizeAlg);
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
