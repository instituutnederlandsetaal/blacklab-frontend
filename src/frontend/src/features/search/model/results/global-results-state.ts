/**
 * This store module contains all global parameters that instantly update the displayed results
 * Think things like context size, random sampling settings.
 */

import { useLocalStorage } from '@vueuse/core';
import { reactive } from 'vue';

import type { CorpusChange } from '@/api/async/logic/corpus/corpus-data-from-id';
import * as ViewModule from '@/features/search/model/results/view-state';

const defaults = {
	pageSize: 20,
	sampleMode: 'percentage' as const, // required to allow putting it in string enum types
};

type ModuleRootState = {
	pageSize: number;
	sampleMode: 'percentage' | 'count';
	sampleSeed: number | null;
	sampleSize: number | null;
	/** context can be a string or number in BlackLab, but for now in the form we only allow numbers. */
	context: number | string | null;
};

type ExternalModuleRootState = Omit<ModuleRootState, 'pageSize'>;

// Create state directly from defaults,
// so we don't have to sync with local storage twice on initialization.
const state: ModuleRootState = reactive({
	pageSize: useLocalStorage('cf/pageSize', defaults.pageSize),
	sampleMode: defaults.sampleMode,
	sampleSeed: null,
	sampleSize: null,
	context: null,
});
const getState = () => state;

const get = {}; //nothing for now.

const actions = {
	pageSize: (pageSize: number) => {
		if (pageSize > 0 && pageSize <= 1000 && pageSize !== state.pageSize) {
			state.pageSize = pageSize;
			ViewModule.forEachView(view => {
				view.first = Math.floor(view.first / pageSize) * pageSize;
				view.number = pageSize;
				view.requestedRange = null;
			});
		}
	},
	sampleMode: (payload?: 'percentage' | 'count') => {
		// reset on null, undefined, invalid strings
		if (!['percentage', 'count'].includes(payload as any)) {
			payload = defaults.sampleMode;
		}
		if (payload === state.sampleMode) {
			return;
		}
		state.sampleMode = payload as any;
		state.sampleSize = null;
	},
	sampleSeed: (payload: number | null) => {
		// Must have a seed when there is a size (e.g. random sampling is active)
		if (state.sampleSize != null && payload == null) {
			payload = Number.MAX_SAFE_INTEGER * Math.random() * (Math.random() > 0 ? 1 : -1);
		}
		state.sampleSeed = payload;
	},
	sampleSize: (payload: number | null) => {
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
			actions.sampleSeed(null);
		}
	},
	context: (payload: number | string | null) => {
		state.context = payload;
	},

	reset: () => {
		// Do not reset page size, as this is a user preference that is stored in local storage. Reset everything else to defaults.
		state.context = null;
		state.sampleMode = 'percentage';
		state.sampleSeed = null;
		state.sampleSize = null;
	},
	replace: (payload: ExternalModuleRootState) => {
		// Use actions so we can verify data
		actions.sampleMode(payload.sampleMode);
		actions.sampleSeed(payload.sampleSeed);
		actions.sampleSize(payload.sampleSize);
		actions.context(payload.context);
	},
};

// Reset on corpus change, defaults are already synced with storage
const init = (_state: CorpusChange) => {
	actions.reset();
};

export { actions, defaults, get, getState, init };
export type { ExternalModuleRootState, ModuleRootState };
