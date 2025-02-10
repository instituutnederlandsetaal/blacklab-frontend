import {getStoreBuilder} from 'vuex-typex';

import { RootState } from '@/store/';

import * as ExploreModule from '@/store/form/explore';
import * as FilterModule from '@/store/form/filters';
import * as InterfaceModule from '@/store/form/interface';
import * as PatternModule from '@/store/form/patterns';
import * as GapModule from '@/store/form/gap';
import * as GlossModule from '@/store/form/glossStore';
import * as ConceptModule from '@/store/form/conceptStore';
import { NormalizedIndex } from '@/types/apptypes';
import { CorpusChange } from '@/store/async-loaders';

type PartialRootState = {
	explore: ExploreModule.ModuleRootState;
	filters: FilterModule.FullModuleRootState;
	interface: InterfaceModule.ModuleRootState;
	patterns: PatternModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
	glosses: GlossModule.ModuleRootState;
	concepts: ConceptModule.ModuleRootState;
};

type ResetState = {
	explore: ExploreModule.ModuleRootState;
	filters: FilterModule.ModuleRootState;
	interface: InterfaceModule.ModuleRootState;
	patterns: PatternModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
	glosses: GlossModule.HistoryState;
	concepts: ConceptModule.HistoryState;
}

const b = getStoreBuilder<RootState>();

const get = {
	// nothing yet.
};

const actions = {
	reset: b.commit(() => {
		ExploreModule.actions.reset();
		FilterModule.actions.reset();
		InterfaceModule.actions.viewedResults(null);
		PatternModule.actions.reset();
		GapModule.actions.reset();
		GlossModule.actions.reset();
		ConceptModule.actions.reset();
	}, 'resetForm'),

	replace: b.commit((state, payload: ResetState) => {
		ExploreModule.actions.replace(payload.explore);
		FilterModule.actions.replace(payload.filters);
		PatternModule.actions.replace(payload.patterns);
		InterfaceModule.actions.replace(payload.interface);
		GapModule.actions.replace(payload.gap);
		GlossModule.actions.replace(payload.glosses);
		ConceptModule.actions.replace(payload.concepts);
	}, 'replaceForm')
};

const init = (state: CorpusChange) => {
	ExploreModule.init(state);
	FilterModule.init(state);
	InterfaceModule.init(state);
	PatternModule.init(state);
	GapModule.init(state);
	GlossModule.init(state);
	ConceptModule.init(state);
};

export {
	PartialRootState,

	get,
	actions,
	init,
};
