import type { CorpusChange } from '@/api/async/logic/corpus/corpus-data-from-id';
import * as ExploreModule from '@/store/form/explore';
import * as FilterModule from '@/store/form/filters';
import * as GapModule from '@/store/form/gap';
import * as InterfaceModule from '@/store/form/interface';
import * as PatternModule from '@/store/form/patterns';

type ModuleRootState = {
	explore: ExploreModule.ModuleRootState;
	filters: FilterModule.ModuleRootState;
	interface: InterfaceModule.ModuleRootState;
	patterns: PatternModule.ModuleRootState;
	gap: GapModule.ModuleRootState;
}

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
	}
};

const init = (state: CorpusChange) => {
	ExploreModule.init(state);
	FilterModule.init(state);
	InterfaceModule.init(state);
	PatternModule.init(state);
	GapModule.init(state);
};

export { actions, get, init };
export type { ModuleRootState };

