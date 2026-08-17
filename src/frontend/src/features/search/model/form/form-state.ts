import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { Customizations } from '@/customization-api/internal/internal-api';
import * as ExploreModule from '@/features/search/model/form/explore-state';
import * as FilterModule from '@/features/search/model/form/filter-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';

type ModuleRootState = {
	explore: ExploreModule.ModuleRootState;
	filters: FilterModule.ModuleRootState;
	interface: InterfaceModule.ModuleRootState;
	patterns: PatternModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
};

const get = {
	// nothing yet.
};

const actions = {
	reset: () => {
		ExploreModule.actions.reset();
		FilterModule.actions.reset();
		InterfaceModule.actions.viewedResults(null);
		PatternModule.actions.reset();
		GapModule.actions.reset();
	},

	replace: (payload: ModuleRootState) => {
		ExploreModule.actions.replace(payload.explore);
		FilterModule.actions.replace(payload.filters);
		PatternModule.actions.replace(payload.patterns);
		InterfaceModule.actions.replace(payload.interface);
		GapModule.actions.replace(payload.gap);
	},
};

const init = (state: CorpusContext, customizations: Customizations) => {
	ExploreModule.init(state, customizations);
	FilterModule.init(state);
	InterfaceModule.init(state);
	PatternModule.init(state, customizations);
	GapModule.init(state);
};

export { actions, get, init };
export type { ModuleRootState };
