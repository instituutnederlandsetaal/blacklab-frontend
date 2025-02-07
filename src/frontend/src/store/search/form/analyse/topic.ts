/*
 * Storage of relevant information for topic pages
*/

import {getStoreBuilder} from 'vuex-typex';
import cloneDeep from 'clone-deep';
import {RootState} from '@/store/search/';
import { stopwords } from '@/store/search/form/analyse/stopword';

type ModuleRootState = {
	stopwords: {
		value: string;
	};

	topicNumber: {
		maxSize: number;
		size: number;
	};

    showNumber: {
		maxSize: number;
		size: number;
	};

    iteration: {
		maxSize: number;
		size: number;
	};

    isCase: {
        value: boolean;
    };
};

const defaults: ModuleRootState = {
	stopwords: {
		value: stopwords,
	},

    topicNumber: {
		maxSize: 50,
		size: 5,
	},

    showNumber: {
		maxSize: 100,
		size: 10,
	},

    iteration: {
		maxSize: 200,
		size: 25,
	},

    isCase: {
        value: false,
    },
};

const namespace = 'topic';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));
const getState = b.state();

const get = {
	stopwords: {
		value: b.read(state => state.stopwords.value, 'stopwords_value'),
	},

	topicNumber: {
		size: b.read(state => state.topicNumber.size, 'topicNumber_size'),
		maxSize: b.read(state => state.topicNumber.maxSize, 'topicNumber_maxSize'),
	},

	showNumber: {
		size: b.read(state => state.showNumber.size, 'showNumber_size'),
		maxSize: b.read(state => state.showNumber.maxSize, 'showNumber_maxSize'),
	},

	iteration: {
		size: b.read(state => state.iteration.size, 'iteration_size'),
		maxSize: b.read(state => state.iteration.maxSize, 'iteration_maxSize'),
	},

	isCase: {
		value: b.read(state => state.isCase.value, 'isCase_value'),
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
	topicNumber: {
		size: b.commit((state, payload: number) => state.topicNumber.size = Math.min(state.topicNumber.maxSize, payload), 'topicNumber_size'),

		reset: b.commit(state => Object.assign(state.topicNumber, cloneDeep(defaults.topicNumber)), 'topicNumber_reset'),

		replace: b.commit((state, payload: ModuleRootState['topicNumber']) => {
			Object.assign(state.topicNumber, payload);
		}, 'topicNumber_replace')
	},
	showNumber: {
		size: b.commit((state, payload: number) => state.showNumber.size = Math.min(state.showNumber.maxSize, payload), 'showNumber_size'),

		reset: b.commit(state => Object.assign(state.showNumber, cloneDeep(defaults.showNumber)), 'showNumber_reset'),

		replace: b.commit((state, payload: ModuleRootState['showNumber']) => {
			Object.assign(state.showNumber, payload);
		}, 'showNumber_replace')
	},
	iteration: {
		size: b.commit((state, payload: number) => state.iteration.size = Math.min(state.iteration.maxSize, payload), 'iteration_size'),

		reset: b.commit(state => Object.assign(state.iteration, cloneDeep(defaults.iteration)), 'iteration_reset'),

		replace: b.commit((state, payload: ModuleRootState['iteration']) => {
			Object.assign(state.iteration, payload);
		}, 'iteration_replace')
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


	replace: b.commit((state, payload: ModuleRootState) => {
		actions.stopwords.replace(payload.stopwords);
		actions.topicNumber.replace(payload.topicNumber);
		actions.showNumber.replace(payload.showNumber);
		actions.iteration.replace(payload.iteration);
		actions.isCase.replace(payload.isCase);
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
