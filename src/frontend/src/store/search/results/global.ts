/**
 * This store module contains all global parameters that instantly update the displayed results
 * Think things like context size, random sampling settings.
 */

import {getStoreBuilder} from 'vuex-typex';

import {RootState} from '@/store/search/';
import { syncPropertyWithLocalStorage } from '@/utils/localstore';

const defaults = {
	pageSize: 20,
	sampleMode: 'percentage' as 'percentage' // required to allow putting it in string enum types
};

const namespace = 'global';
type ModuleRootState = {
	pageSize: number;
	sampleMode: 'percentage'|'count';
	sampleSeed: number|null;
	sampleSize: number|null;
	/** context can be a string or number in BlackLab, but for now in the form we only allow numbers. */
	context: number|string|null;
};

type ExternalModuleRootState = Omit<ModuleRootState, 'pageSize'>;

const initialState: ModuleRootState = {
	pageSize: defaults.pageSize as number,
	sampleMode: defaults.sampleMode,
	sampleSeed: null,
	sampleSize: null,
	context: null,
};

const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, Object.assign({}, initialState));

const getState = b.state();
const get = {}; //nothing for now.

const actions = {
	pageSize: b.dispatch(({state, rootState}, pageSize: number) => {
		if (pageSize > 0 && pageSize <= 1000 && pageSize !== state.pageSize) {
			state.pageSize = pageSize;
			Object.values(rootState.views).forEach(view => {
				view.first = Math.floor(view.first / pageSize) * pageSize;
				view.number = pageSize;
			});
		}
	}, 'pagesize'),
	sampleMode: b.commit((state, payload?: 'percentage'|'count') => {
		// reset on null, undefined, invalid strings
		if (!['percentage', 'count'].includes(payload as any)) { payload = defaults.sampleMode; }
		if (payload === state.sampleMode) { return; }
		state.sampleMode =  payload as any;
		state.sampleSize = null;
	}, 'samplemode'),
	sampleSeed: b.commit((state, payload: number|null) => {
		// Must have a seed when there is a size (e.g. random sampling is active)
		if (state.sampleSize != null && payload == null) {
			payload = Number.MAX_SAFE_INTEGER - (Math.random() * 2 * Number.MAX_SAFE_INTEGER);
		}
		state.sampleSeed = payload;
	}, 'sampleseed'),
	sampleSize: b.commit((state, payload: number|null) => {
		if (payload == null) {
			state.sampleSize = payload;
			return;
		}

		if (state.sampleMode === 'percentage') {
			state.sampleSize = Math.max(0, Math.min(payload, 100));
		} else {
			state.sampleSize = Math.max(0, payload);
		}

		// null check already passed
		// if missing seed, randomize it now
		if (state.sampleSeed == null) {
			actions.sampleSeed(Number.MAX_SAFE_INTEGER - (Math.random() * 2 * Number.MAX_SAFE_INTEGER));
		}

	}, 'samplesize'),
	context: b.commit((state, payload: number|string|null) => state.context = payload, 'context'),

	reset: b.commit(state => Object.assign(state, initialState), 'reset'),
	replace: b.commit((state, payload: ExternalModuleRootState) => {
		// Use actions so we can verify data
		actions.sampleMode(payload.sampleMode);
		actions.sampleSeed(payload.sampleSeed);
		actions.sampleSize(payload.sampleSize);
		actions.context(payload.context);
	}, 'replace'),
};

const init = () => {
	syncPropertyWithLocalStorage('cf/pageSize', getState(), 'pageSize');
};

export {
	ExternalModuleRootState,
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
