import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type * as InterfaceStore from '@/features/search/model/form/interface-state';
import type * as QueryStore from '@/features/search/model/query-state';
import type * as ViewStore from '@/features/search/model/results/view-state';

export type SearchPageQueryParamsInput = {
	query: QueryStore.ModuleRootState;
	interface: InterfaceStore.ModuleRootState;
	blacklabParams: BlackLabParameters;
	view: ViewStore.ViewRootState;
};

export function getSubmittedInterfaceState({ query, interface: interfaceState }: Pick<SearchPageQueryParamsInput, 'query' | 'interface'>): Partial<InterfaceStore.ModuleRootState> | undefined {
	if (query.form === 'new') {
		// The new form persists its own UI state separately. Omitting the legacy
		// interface parameter also lets older frontends infer a graceful fallback.
		return undefined;
	}

	const shared = {
		viewedResults: undefined,
		activeAnnotationTab: interfaceState.activeAnnotationTab || undefined,
		activeFilterTab: interfaceState.activeFilterTab || undefined,
	};

	if (query.form === 'explore') {
		return {
			...shared,
			form: 'explore',
			exploreMode: query.subForm,
		};
	}

	if (query.form === 'search') {
		return {
			...shared,
			form: 'search',
			patternMode: query.subForm,
		};
	}

	// No query has been submitted yet, so keep using the live legacy form state.
	return {
		...shared,
		form: 'search',
		exploreMode: interfaceState.exploreMode,
		patternMode: interfaceState.patternMode,
	};
}
