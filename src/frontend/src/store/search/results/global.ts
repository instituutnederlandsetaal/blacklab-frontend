/**
 * This store module contains all global parameters that instantly update the displayed results
 * Think things like context size, random sampling settings.
 *
 * Page size is managed separately via localStorageSynced as it's a local user preference
 * that should not be shared via URL or history.
 */

import {getStoreBuilder} from 'vuex-typex';

import {RootState} from '@/store/search/';
import { localStorageSynced } from '@/utils/localstore';

const defaults = {
	pageSize: 20,
	sampleMode: 'percentage' as 'percentage' // required to allow putting it in string enum types
};

/**
 * Page size is a local user preference, not part of the store state.
 * It's persisted in localStorage and reactive via Vue.observable.
 * Use `pageSize.value` to get/set the value.
 */
export const pageSize = localStorageSynced('cf/pageSize', defaults.pageSize);

/** Validate and set page size */
export function setPageSize(value: number): void {
	pageSize.value = [20, 50, 100, 200].includes(value) ? value : defaults.pageSize;
}

const namespace = 'global';

/**
 * Note: pageSize is NOT part of the store state anymore.
 * Use the exported `pageSize` reactive ref instead.
 */
type ModuleRootState = {
	sampleMode: 'percentage'|'count';
	sampleSeed: number|null;
	sampleSize: number|null;
	/** context can be a string or number in BlackLab, but for now in the form we only allow numbers. */
	context: number|string|null;
};

const initialState: ModuleRootState = {
	sampleMode: defaults.sampleMode,
	sampleSeed: null,
	sampleSize: null,
	context: null,
};

const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, Object.assign({}, initialState));

const getState = b.state();
const get = {}; //nothing for now.

const actions = {
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
	replace: b.commit((state, payload: ModuleRootState) => {
		// Use actions so we can verify data
		actions.sampleMode(payload.sampleMode);
		actions.sampleSeed(payload.sampleSeed);
		actions.sampleSize(payload.sampleSize);
		actions.context(payload.context);
	}, 'replace'),
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = () => {/**/};

export {
	ModuleRootState as ExternalModuleRootState,
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
