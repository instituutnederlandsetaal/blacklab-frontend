import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import type { CustomizationRegistry } from '@/customization-api/registry';
import * as FilterStore from '@/features/search/model/form/filter-state';
import type { FilterDefinition } from '@/types/apptypes';

/** Compatibility adapter for the old filter Vuex module. Not for internal use. */
type LegacyFilterGroup = {
	tabname?: string;
	name?: string;
	subtabs?: Array<{ tabname?: string; fields: Array<string | FilterDefinition<unknown>> }>;
};
type LegacyRegisterFilterPayload = FilterDefinition<unknown> | { filter: FilterDefinition<unknown>; insertBefore?: string };

function createFilterStoreAdapter(registry: CustomizationRegistry) {
	const filterGroups = () => registry.legacyApi.value?.search.metadata._customTabs ?? [];

	function registerFilterGroup({ id, filterIds }: { id: string; filterIds: string[] }) {
		if (filterGroups().some(group => (group.name ?? group.tabname) === id)) {
			console.warn(`Filter group ${id} already exists`);
			return;
		}
		filterGroups().push({
			tabname: id,
			subtabs: [{ fields: filterIds.filter(filterId => FilterStore.getState().filters[filterId] != null) }],
		});
	}

	function registerFilter(payload: LegacyRegisterFilterPayload) {
		const filter = 'filter' in payload ? payload.filter : payload;
		const insertBefore = 'filter' in payload ? payload.insertBefore : undefined;

		if (filter.groupId) {
			let group = filterGroups().find(group => (group.name ?? group.tabname) === filter.groupId) as LegacyFilterGroup | undefined;
			if (!group) {
				registerFilterGroup({ id: filter.groupId, filterIds: [] });
				group = filterGroups().find(group => (group.name ?? group.tabname) === filter.groupId) as LegacyFilterGroup;
			}
			const subtabs = (group.subtabs ??= [{ fields: [] }]);
			const subtab = (insertBefore && subtabs.find(candidate => candidate.fields.includes(insertBefore))) || subtabs[0];
			const index = insertBefore ? subtab.fields.indexOf(insertBefore) : -1;
			subtab.fields.splice(index < 0 ? subtab.fields.length : index, 0, filter.id);
		}

		FilterStore.actions.registerFilter(filter);
	}

	return {
		getState: () => ({
			...FilterStore.getState(),
			get filterGroups() {
				return filterGroups();
			},
		}),
		get: {
			...FilterStore.get,
			hasSpanFilters: () => Object.values(FilterStore.getState().filters).some(filter => getValueFunctions(filter).isSpanFilter),
		},
		actions: {
			...FilterStore.actions,
			registerFilterGroup,
			registerFilter,
		},
		init: FilterStore.init,
	};
}

export { createFilterStoreAdapter };
