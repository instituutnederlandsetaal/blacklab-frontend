/**
 * This module contains a single entry for every metadata field in this corpus.
 * It contains the current ui state for frequency list form.
 *
 * When the user actually executes the query a snapshot of the state is copied to the query module.
 */

import { useMemoize } from '@vueuse/core';
import { reactive } from 'vue';

import { useBlackLabApi } from '@/_new/app/plugins/installApi';
import type { CorpusChange } from '@/_new/app/plugins/installCorpusData';
import * as CorpusModule from '@/_new/features/corpus/store/corpus-store';
import { corpusCustomizations } from '@/_new/pages/search/config/customization-callback-store';
import { getFilterString, getFilterSummary, getValueFunctions } from '@/_new/pages/search/form/filters/lib/filterValueFunctions';
import type { FilterDefinition } from '@/_new/types/apptypes';

import { debugLogCat } from '@/_new/shared/debug/debug';
import { mapReduce } from '@/_new/shared/utils/map-reduce';

export type FilterState = {
	value: unknown;
};

export type FullFilterState = FilterDefinition<unknown> & FilterState;

/** A group of metadata filters (i.e. a tab in the search interface) */
export type FilterGroupType = {
	/** Name on the tab */
	tabname: string;
	/** Groups of related fields on this tab ("subtabs") */
	subtabs: Array<{
		tabname?: string;
		fields: string[];
	}>;
	/** Filter query that is always included if this filter group (tab) is active. */
	query?: Record<string, string[]>;
};

type ModuleRootState = {
	filters: {
		[filterId: string]: FullFilterState;
	};
	// Differently structured from the normal BlackLab MetadataFieldGroups, because we allow inserting subheaders between fields, and activating a query on tab activation
	filterGroups: FilterGroupType[];
};

type ExternalModuleRootState = ModuleRootState['filters'];

/** Populated on store initialization and afterwards */
const initialState: ModuleRootState = {
	filters: {},
	filterGroups: [],
};

const state = reactive(structuredClone(initialState));
const getState = () => state;

const get = {
	/** Return all filters holding a value */
	activeFilters: useMemoize(
		() =>
			Object.values(state.filters)
				.filter(f => getValueFunctions(f).isActive(f.id, f.metadata, f.value))
				.sort((a, b) => a.id.localeCompare(b.id)), // sort by id for stable order, important for derived state comparisons (e.g. history entries)
	),
	/** Return activeFilters as associative map instead of array */
	activeFiltersMap: useMemoize(() => {
		const activeFilters: FullFilterState[] = get.activeFilters();
		return mapReduce(activeFilters, 'id');
	}),

	luceneQuery: useMemoize((): string | undefined => getFilterString(get.activeFilters())),
	luceneQuerySummary: useMemoize((): string | undefined => getFilterSummary(get.activeFilters())),

	filterValue: (id: string) => state.filters[id],

	hasSpanFilters: useMemoize(() => !!Object.values(state.filters).find(f => getValueFunctions(f).isSpanFilter)),
};

const actions = {
	registerFilterGroup: (filterGroup: { id: string; filterIds: string[] }) => {
		if (state.filterGroups.find(g => g.tabname === filterGroup.id)) {
			console.warn(`Filter group ${filterGroup.id} already exists`);
			return;
		}
		state.filterGroups.push({
			tabname: filterGroup.id,
			subtabs: [
				{
					tabname: undefined,
					fields: filterGroup.filterIds.filter(id => state.filters[id] != null),
				},
			],
		});
	},

	registerFilter: ({
		filter,
		insertBefore,
	}: {
		/** Filter definition */
		filter: FilterDefinition<unknown>;
		/** Optional: ID of another filter in this group before which to insert this filter, if omitted, the filter is appended at the end. */
		insertBefore?: string;
	}) => {
		if (filter.groupId) {
			if (!state.filterGroups.find(g => g.tabname === filter.groupId)) {
				actions.registerFilterGroup({
					filterIds: [],
					id: filter.groupId,
				});
			}
			const group = state.filterGroups.find(g => g.tabname === filter.groupId)!;
			const subtabIndex = insertBefore != null && state.filters[insertBefore] ? group.subtabs.findIndex(subtab => subtab.fields.includes(insertBefore)) : 0;
			const index = subtabIndex != 0 ? group.subtabs[subtabIndex].fields.indexOf(insertBefore!) : -1;
			group.subtabs[subtabIndex].fields.splice(index !== -1 ? index : group.subtabs[subtabIndex].fields.length, 0, filter.id);
		}

		if (state.filters[filter.id]) {
			// already exists, might be registered twice because it's in multiple groups
			return;
		}

		// Backwards compat: we renamed these fields but not all extension scripts are up-to-date
		//@ts-ignore
		filter.defaultDisplayName = filter.defaultDisplayName || filter.displayName;
		//@ts-ignore
		filter.defaultDescription = filter.defaultDescription || filter.description;

		state.filters[filter.id] = { ...filter, value: null };
	},

	filterValue: ({ id, value }: Pick<FullFilterState, 'id' | 'value'>) => {
		const filterObj = state.filters[id];
		if (!filterObj) {
			console.error(`Filter ${id} does not exist`);
		}
		return (filterObj.value = value != null ? value : null);
	},

	reset: () =>
		Object.keys(state.filters).forEach(k => {
			state.filters[k].value = null;
		}),

	replace: (payload: ExternalModuleRootState) => {
		actions.reset();
		Object.values(payload).forEach(actions.filterValue);
	},
};

const internalActions = {
	clearState: () => {
		state.filterGroups = [];
		state.filters = {};
	},
};

const init = (state: CorpusChange) => {
	internalActions.clearState();
	if (!state.index) {
		return;
	}

	// Take care to copy the order of metadatagroups and their fields here!
	CorpusModule.get.metadataGroups().forEach(g => {
		actions.registerFilterGroup({
			filterIds: [],
			id: g.id,
		});

		g.fields.forEach(f => {
			let componentName;
			let metadata: any;
			switch (f.uiType) {
				case 'checkbox':
					componentName = 'filter-checkbox';
					metadata = f.values || [];
					break;
				case 'combobox':
					componentName = 'filter-autocomplete';
					metadata = function autocompleteMetadata(v: string): Promise<string[]> {
						return useBlackLabApi().getMetadataAutocomplete(state.index!.id, f.id, v);
					};
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
				case 'text':
				default:
					componentName = 'filter-text';
					metadata = undefined;
					break;
			}

			actions.registerFilter({
				filter: {
					componentName,
					defaultDescription: f.defaultDescription,
					defaultDisplayName: f.defaultDisplayName,
					groupId: g.id,
					id: f.id,
					metadata,
				},
			});
		});
	});

	// Make sure we register all fields in any custom tabs
	corpusCustomizations.search.metadata._customTabs
		.map(t => ({ name: t.name, fields: t.fields ?? t.subtabs.flatMap((s: any) => s.fields) })) // flatten subtabs
		.map(t => t.fields.map((f: any) => ({ groupId: t.name, ...f }))) // fill in missing groupId if any
		.flat() // flatten tabs
		.filter(f => f.id)
		.forEach(f => {
			actions.registerFilter({
				filter: f as FilterDefinition<unknown>,
			});
		});

	debugLogCat('init', 'Finished initializing filter module state shape');
};

export { actions, get, getState, init };
export type { ModuleRootState as FullModuleRootState, ExternalModuleRootState as ModuleRootState };
