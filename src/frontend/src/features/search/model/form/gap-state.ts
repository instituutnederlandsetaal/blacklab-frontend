/**
 * Contains the current ui state for the simple/extended/advanced/expert query editors.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import { reactive } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';

type ModuleRootState = {
	value: string | null;
};

const initialState: ModuleRootState = {
	value: null,
};

const state = reactive(structuredClone(initialState));
const getState = () => state;

const get = {
	gapValue: () => state.value,
};

const actions = {
	gapValue: (payload: ModuleRootState['value']) => (state.value = payload),
	gapValueFile: (payload: File) =>
		new Promise<void>((resolve, reject) => {
			const fr = new FileReader();
			fr.onload = () => {
				actions.gapValue(fr.result as string);
				resolve();
			};
			fr.readAsText(payload);
		}),

	reset: () => (state.value = null),
	replace: (payload: ModuleRootState) => Object.assign(state, payload),
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = (_state: CorpusContext) => {
	actions.reset();
};

export { actions, initialState as defaults, get, getState, init };
export type { ModuleRootState };
