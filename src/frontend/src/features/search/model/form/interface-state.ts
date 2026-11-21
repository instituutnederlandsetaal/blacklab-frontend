import { reactive } from 'vue';

const state = reactive<{ viewedResults: string | null }>({ viewedResults: null });
const getState = () => state;

const get = {
	viewedResults: () => state.viewedResults,
};

const actions = {
	viewedResults: (payload: string | null) => (state.viewedResults = payload),
};

export { actions, get, getState };
