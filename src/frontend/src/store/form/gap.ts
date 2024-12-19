/**
 * Contains the current ui state for the simple/extended/advanced/expert query editors.
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import Vue from 'vue';
import { getStoreBuilder } from 'vuex-typex';
import cloneDeep from 'clone-deep';

import { RootState } from '@/store/';

type ModuleRootState = {
	value: string|null;
};

// There are three levels of state initialization
// First: the basic state shape (this)
// Then: the basic state shape with the appropriate annotation and filters created
// Finally: the values initialized from the page's url on first load.
const defaults: ModuleRootState = {
	value: null,
};

const namespace = 'gapfilling';
const b = getStoreBuilder<RootState>().module<ModuleRootState>(namespace, cloneDeep(defaults));

const getState = b.state();

const get = {
	gapValue: b.read(state => state.value, 'gapValue')
};

const actions = {
	gapValue: b.commit((state, payload: ModuleRootState['value']) => state.value = payload, 'setGapValue'),
	gapValueFile: b.dispatch(({state, rootState}, payload: File) => new Promise((resolve, reject) => {
		const fr = new FileReader();
		fr.onload = () => {
			actions.gapValue(fr.result as string);
			resolve();
		};
		fr.readAsText(payload);
	}), 'setGapValueFromFile'),

	reset: b.commit(state => state.value = null, 'reset'),
	replace: b.commit((state, payload: ModuleRootState) => Object.assign(state, payload), 'replace'),
};

/** We need to call some function from the module before creating the root store or this module won't be evaluated (e.g. none of this code will run) */
const init = () => {/**/};

export {
	ModuleRootState,

	getState,
	get,
	actions,
	init,

	namespace,
	defaults
};
