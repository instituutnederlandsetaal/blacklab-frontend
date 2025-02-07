/**
 * Storage of relevant information for keyword pages
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

	keywordAlg: {
		value: "TF-IDF" | "TextRank";
	},

	// the four parameters show in page when keywordAlg is "TextRank"
	dampingFactor :{
		size: number;
		maxSize: number;
		minSize: number;
	},

	maxIter: {
		size: number;
		maxSize: number;
		minSize: number;
	},

	minDiff: {
		size: number;
		maxSize: number;
		minSize: number;
	},

	windowSize: {
		size: number;
		maxSize: number;
		minSize: number;
	},
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

	keywordAlg: {
		value: "TextRank",
	},

	dampingFactor :{
		size: 0.85,
		maxSize: 0.95,
		minSize: 0.4,
	},

	maxIter: {
		size: 100,
		maxSize: 300,
		minSize: 50,
	},

	minDiff: {
		size: 0.0001,
		maxSize: 0.001,
		minSize: 0.00001,
	},

	windowSize: {
		size: 3,
		maxSize: 10,
		minSize: 2,
	},
};

const namespace = 'keyword';
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

	keywordAlg: {
		value: b.read(state => state.keywordAlg.value, 'keywordAlg_value'),
	},

	dampingFactor :{
		size: b.read(state => state.dampingFactor.size, 'dampingFactor_size'),
		maxSize: b.read(state => state.dampingFactor.maxSize, 'dampingFactor_maxSize'),
		minSize: b.read(state => state.dampingFactor.minSize, 'dampingFactor_minSize'),
	},

	maxIter: {
		size: b.read(state => state.maxIter.size, 'maxIter_size'),
		maxSize: b.read(state => state.maxIter.maxSize, 'maxIter_maxSize'),
		minSize: b.read(state => state.maxIter.minSize, 'maxIter_minSize'),
	},

	minDiff: {
		size: b.read(state => state.minDiff.size, 'minDiff_size'),
		maxSize: b.read(state => state.minDiff.maxSize, 'minDiff_maxSize'),
		minSize: b.read(state => state.minDiff.minSize, 'minDiff_minSize'),
	},

	windowSize: {
		size: b.read(state => state.windowSize.size, 'windowSize_size'),
		maxSize: b.read(state => state.windowSize.maxSize, 'windowSize_maxSize'),
		minSize: b.read(state => state.windowSize.minSize, 'windowSize_minSize'),
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

	keywordAlg: {
		value: b.commit((state, payload: any) => {
			state.keywordAlg.value = payload;
		}, 'keywordAlg_value'),

		reset: b.commit(state => Object.assign(state.keywordAlg, cloneDeep(defaults.keywordAlg)), 'keywordAlg_reset'),

		replace: b.commit((state, payload: ModuleRootState['keywordAlg']) => {
			Object.assign(state.keywordAlg, payload);
		}, 'keywordAlg_replace')
	},

	dampingFactor: {
		size: b.commit((state, payload: number) => {
			state.dampingFactor.size = Math.max(Math.min(state.dampingFactor.maxSize, payload), state.dampingFactor.minSize);
		}, 'dampingFactor_size'),

		reset: b.commit(state => Object.assign(state.dampingFactor, cloneDeep(defaults.dampingFactor)), 'dampingFactor_reset'),

		replace: b.commit((state, payload: ModuleRootState['dampingFactor']) => {
			Object.assign(state.dampingFactor, payload);
		}, 'dampingFactor_replace')
	},

	maxIter: {
		size: b.commit((state, payload: number) => {
			state.maxIter.size = Math.max(Math.min(state.maxIter.maxSize, payload), state.maxIter.minSize);
		}, 'maxIter_size'),

		reset: b.commit(state => Object.assign(state.maxIter, cloneDeep(defaults.maxIter)), 'maxIter_reset'),

		replace: b.commit((state, payload: ModuleRootState['maxIter']) => {
			Object.assign(state.maxIter, payload);
		}, 'maxIter_replace')
	},

	minDiff: {
		size: b.commit((state, payload: number) => {
			state.minDiff.size = Math.max(Math.min(state.minDiff.maxSize, payload), state.minDiff.minSize);
		}, 'minDiff_size'),

		reset: b.commit(state => Object.assign(state.minDiff, cloneDeep(defaults.minDiff)), 'minDiff_reset'),

		replace: b.commit((state, payload: ModuleRootState['minDiff']) => {
			Object.assign(state.minDiff, payload);
		}, 'minDiff_replace')
	},

	windowSize: {
		size: b.commit((state, payload: number) => {
			state.windowSize.size = Math.max(Math.min(state.windowSize.maxSize, payload), state.windowSize.minSize);
		}, 'windowSize_size'),

		reset: b.commit(state => Object.assign(state.windowSize, cloneDeep(defaults.windowSize)), 'windowSize_reset'),

		replace: b.commit((state, payload: ModuleRootState['windowSize']) => {
			Object.assign(state.windowSize, payload);
		}, 'windowSize_replace')
	},

	replace: b.commit((state, payload: ModuleRootState) => {
		actions.stopwords.replace(payload.stopwords);
		actions.showNumber.replace(payload.showNumber);
		actions.isCase.replace(payload.isCase);
		actions.keywordAlg.replace(payload.keywordAlg);
		actions.dampingFactor.replace(payload.dampingFactor);
		actions.maxIter.replace(payload.maxIter);
		actions.minDiff.replace(payload.minDiff);
		actions.windowSize.replace(payload.windowSize);
	}, 'replace'),

	reset: b.commit(state => Object.assign(state, cloneDeep(defaults)), 'reset'),
}

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
