import { ref } from 'vue';

import type { CorpusContext } from '@/features/corpus/corpus-context';
import type { Tagset } from '@/types/apptypes';

type ModuleRootState = Tagset | null;

const state = ref<ModuleRootState>(null);
const getState = () => state.value;

const get = {};

const init = (payload: CorpusContext) => {
	state.value = payload.tagset ?? null;
};

const actions = {
	load: () => {
		console.warn('Manual tagset loading is no longer required. Remove the call to tagset.actions.load() from customJS - instead, place the tagset in ${corpusName}/static/tagset.json');
	},
};

/** @public Store methods exposed through `vuexModules.tagset`. */
export { actions, get, getState, init };
