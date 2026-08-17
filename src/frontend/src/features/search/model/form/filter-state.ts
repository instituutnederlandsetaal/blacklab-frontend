import { reactive } from 'vue';

import { type CorpusContext } from '@/app/state/useCorpusContext';
import { getFilterString, getFilterSummary, getValueFunctions } from '@/components/filters/filterValueFunctions';
/**
 * This module contains a single entry for every metadata field in this corpus.
 * It contains the current ui state for frequency list form.
 *
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */
import { memoize } from '@/features/search/model/form/reactive-store';
import type { FilterDefinition } from '@/types/apptypes';

import { debugLog } from '@/shared/debug/debug';
import { mapReduce } from '@/shared/utils/array-utils';

export type FilterState = {
	value: unknown;
};

export type FullFilterState = FilterDefinition<unknown> & FilterState;

type ModuleRootState = {
	filters: {
		[filterId: string]: FullFilterState;
	};
};

type ExternalModuleRootState = ModuleRootState['filters'];

/** Populated on store initialization and afterwards */
const initialState: ModuleRootState = {
	filters: {},
};

const state = reactive(structuredClone(initialState));
const getState = () => state;

const get = {
	/** Return all filters holding a value */
	activeFilters: memoize(
		() =>
			Object.values(state.filters)
				.filter(f => getValueFunctions(f).isActive(f.id, f.metadata, f.value))
				.sort((a, b) => a.id.localeCompare(b.id)), // sort by id for stable order, important for derived state comparisons (e.g. history entries)
	),
	/** Return activeFilters as associative map instead of array */
	activeFiltersMap: memoize(() => {
		const activeFilters: FullFilterState[] = get.activeFilters();
		return mapReduce(activeFilters, 'id');
	}),

	luceneQuery: memoize((): string | undefined => getFilterString(get.activeFilters())),
	luceneQuerySummary: memoize((): string | undefined => getFilterSummary(get.activeFilters())),

	filterValue: (id: string) => state.filters[id],
};

const actions = {
	registerFilter: (filter: FilterDefinition<unknown>) => {
		if (state.filters[filter.id]) {
			// Registration is idempotent.
			return;
		}

		// Backwards compat: we renamed these fields but not all extension scripts are up-to-date
		//@ts-ignore
		filter.defaultDisplayName = filter.defaultDisplayName || filter.displayName;
		//@ts-ignore
		filter.defaultDescription = filter.defaultDescription || filter.description;

		state.filters[filter.id] = { ...filter, value: undefined };
	},

	filterValue: ({ id, value }: Pick<FullFilterState, 'id' | 'value'>) => {
		const filterObj = state.filters[id];
		if (!filterObj) {
			console.error(`Filter ${id} does not exist`);
		}
		return (filterObj.value = value != null ? value : undefined);
	},

	reset: () =>
		Object.keys(state.filters).forEach(k => {
			state.filters[k].value = undefined;
		}),

	replace: (payload: ExternalModuleRootState) => {
		actions.reset();
		Object.values(payload).forEach(actions.filterValue);
	},
};

const init = (state: CorpusContext) => {
	getState().filters = {};
	if (!state.index) return;

	state.index.allMetadataFields.forEach(f => {
		let componentName;
		let metadata: any;
		switch (f.uiType) {
			case 'checkbox':
				componentName = 'filter-checkbox';
				metadata = f.values || [];
				break;
			case 'combobox':
				componentName = 'filter-autocomplete';
				metadata = f.id;
				break;
			case 'radio':
				componentName = 'filter-radio';
				metadata = f.values || [];
				break;
			case 'range':
				componentName = 'filter-range';
				metadata = undefined;
				break;
			case 'select':
				componentName = 'filter-select';
				metadata = f.values || [];
				break;
			case 'date':
				componentName = 'filter-date';
				metadata = {
					field: f.id,
				};
				break;
			case 'text':
			default:
				componentName = 'filter-text';
				metadata = undefined;
				break;
		}

		actions.registerFilter({
			componentName,
			defaultDescription: f.defaultDescription,
			defaultDisplayName: f.defaultDisplayName,
			id: f.id,
			metadata,
		});
	});

	debugLog('init', 'Finished initializing filter module state shape');
};

export { actions, get, getState, init };
export type { ModuleRootState as FullModuleRootState, ExternalModuleRootState as ModuleRootState };
