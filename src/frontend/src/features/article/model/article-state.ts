import { reactive } from 'vue';

import type * as BLTypes from '@/types/blacklabtypes';
import type { CorpusContext } from '@/app/state/useCorpusContext';

type ModuleRootState = {
	distributionAnnotation: null | {
		/** Id of the annotation */
		id: string;
		/** Label/displayName of the chart */
		displayName: string;
	};
	growthAnnotations: null | {
		/** Label/displayName of the chart */
		displayName: string;
		annotations: Array<{
			/** Id of the annotation */
			id: string;
			/** Label/displayName of the graph line */
			displayName: string;
		}>;
	};
	/** Injectable function to calculate whichever properties about a document */
	statisticsTableFn: null | ((document: BLTypes.BLDocument, snippet: BLTypes.BLHitSnippet) => { [key: string]: string });

	baseColor: string; // TODO make ui store shared.
};

const initialState: ModuleRootState = {
	distributionAnnotation: null,
	growthAnnotations: null,
	statisticsTableFn: null,
	baseColor: '#337ab7', // bootstrap primary
};

const state = reactive(structuredClone(initialState));
const getState = () => state;

const get = {
	baseColor: () => state.baseColor,
	distributionAnnotation: () => state.distributionAnnotation,
	growthAnnotations: () => state.growthAnnotations,
	statisticsTableFn: () => state.statisticsTableFn,
	statisticsEnabled: () => !!(state.statisticsTableFn || state.growthAnnotations || state.distributionAnnotation),
};

const actions = {
	distributionAnnotation: (payload: ModuleRootState['distributionAnnotation']) => (state.distributionAnnotation = payload),
	growthAnnotations: (payload: ModuleRootState['growthAnnotations']) => (state.growthAnnotations = payload),
	statisticsTableFn: (payload: ModuleRootState['statisticsTableFn']) => (state.statisticsTableFn = payload),
	baseColor: (payload: string) => (state.baseColor = payload),
};

const init = (state: CorpusContext) => {
	if (!state.index) Object.assign(getState(), initialState);
};

export { actions, get, getState, init };
export type { ModuleRootState };
