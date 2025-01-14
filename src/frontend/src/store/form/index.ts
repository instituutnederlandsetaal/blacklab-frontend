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

const init = (corpus: NormalizedIndex|null) => {
	ExploreModule.init(corpus);
	FilterModule.init(corpus);
	InterfaceModule.init(corpus);
	PatternModule.init(corpus);
	GapModule.init(corpus);
	GlossModule.init(corpus);
	ConceptModule.init(corpus);
};

export {
	PartialRootState,

	get,
	actions,
	init,
};
