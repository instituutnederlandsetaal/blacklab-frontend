<template>
	<div>
		<h3>{{$t('filter.heading')}}</h3>

		<template v-if="useTabs">
		<ul class="nav nav-tabs" v-if="tabs.length > 1">
			<li v-for="tab in tabs" :class="{'active': activeTab===tab.tabname}" :key="tab.tabname" @click.prevent="activeTab=tab.tabname;">
				<a :href="'#'+tab.tabname">
					{{tab.tabname}}
					<span v-if="activeFiltersMap[tab.tabname]" class="badge" style="background-color:#aaa; vertical-align: baseline;">
						{{activeFiltersMap[tab.tabname]}}
					</span>
				</a>
			</li>
		</ul>

		<div class="tab-content">
			<div v-for="(tab, i) in tabs"
				:class="['tab-pane', 'form-horizontal', 'filter-container', {'active': activeTab===tab.tabname}]"
				:key="tab.tabname"
				:id="tab.tabname"
			>
				<template v-for="(subtab, j) in tab.subtabs">
					<h3 v-if="subtab.tabname" :key="j + subtab.tabname">{{subtab.tabname}}</h3>
					<hr v-else-if="j !== 0" :key="j">
					<Component v-for="id in subtab.fields" :key="tab.tabname + id"
						:is="filterMap[id].componentName"
						:htmlId="i+(j+id) /* brackets or else i+j collapses before stringifying */"
						:definition="filterMap[id]"
						:textDirection="textDirection"
						:showLabel="subtab.fields.length > 1 || !subtab.tabname"
						:value="filterMap[id].value != null ? filterMap[id].value : undefined"

						@change-value="updateFilterValue(id, $event)"
					/>
				</template>
			</div>
		</div>
		</template>
		<div v-else-if="allFilters.length" class="tab-content form-horizontal filter-container"> <!-- TODO don't use tab-content when no tabs -->
			<Component v-for="filter in allFilters" :key="filter.id"
				:is="filter.componentName"
				:htmlId="`filter_${filter.id}`"
				:definition="filter"
				:textDirection="textDirection"
				:value="filter.value != null ? filter.value : undefined"

				@change-value="updateFilterValue(filter.id, $event)"
			/>
		</div>
		<div v-else class="text-muted well">
			<h4>{{$t('filter.noFilter.title')}}</h4>
			<em>{{$t('filter.noFilter.content')}}</em>
		</div>

		<FilterOverview/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';
import * as FilterStore from '@/store/search/form/filters';

import FilterOverview from '@/pages/search/form/FilterOverview.vue';
import { mapReduce } from '@/utils';

import { getValueFunctions } from '@/components/filters/filterValueFunctions';

import * as RootStore from '@/store/search';

export default Vue.extend({
	components: {
		FilterOverview,
	},
	data: () => ({
		activeTab: null as string|null,
		cancelFilterWatch: [] as Array<() => void>,
	}),
	methods: {
		updateFilterValue(id: string, value: any) { FilterStore.actions.filterValue({id, value}); },
	},
	computed: {
		textDirection(): string { return CorpusStore.get.textDirection(); },
		allFilters(): FilterStore.FullFilterState[] {
			const seenIds = new Set<string>();
			const filterMap = this.filterMap;
			return this.tabs.flatMap(t => t.subtabs.flatMap(tab => tab.fields.map(id => filterMap[id]))).filter(f => {
				const seen = seenIds.has(f.id);
				seenIds.add(f.id);
				return !seen;
			});
		},
		tabs(): FilterStore.FilterGroupType[] {
			const availableBuiltinFilters = CorpusStore.get.allMetadataFieldsMap();
			const builtinFiltersToShow = UIStore.getState().search.shared.searchMetadataIds;
			const customFilters = Object.keys(FilterStore.getState().filters).filter(id => !availableBuiltinFilters[id]);
			const allIdsToShow = new Set(builtinFiltersToShow.concat(customFilters));

			// the filters should be in the correct order already
			let result = FilterStore.getState().filterGroups
				.map<FilterStore.FilterGroupType>(group => ({
					tabname: this.$tMetaGroupName(group.tabname)?.toString(),
					subtabs: group.subtabs
						.map(subtab => ({
							tabname: this.$tMetaGroupName(subtab.tabname)?.toString(),
							fields: subtab.fields.filter(id => {
								const showField = UIStore.corpusCustomizations.search.metadata.showField(id);
								return showField === true || (showField === null && allIdsToShow.has(id));
							})
						}))
						.filter(subtab => subtab.fields.length),
					query: group.query
				}) as FilterStore.FilterGroupType);
			result = result.filter(g => g.subtabs.length);
			return result;
		},
		filterMap(): Record<string, FilterStore.FullFilterState> {
			return FilterStore.getState().filters;
		},
		useTabs(): boolean { return this.tabs.length > 1 || this.tabs.length > 0 && this.tabs[0].subtabs.length > 1; },
		activeFiltersMap(): Record<string, number> {
			const activeTab = this.tabs.find(t => t.tabname === this.activeTab);
			const filterMap = this.filterMap;

			const implicitlyActiveFilters: Record<string, string[]> = activeTab?.query || {}; // filters that are always active as long as this tab is active
			const manuallyActiveFiltersInCurrentTab: Record<string, boolean> = activeTab ? mapReduce(activeTab.subtabs.flatMap(subtab => subtab.fields.filter(f =>
				// keep only those filters that are -a: active and -b: not in the implicitly active set
				// when is a filter active? when its value returns a non-null lucene query
				!implicitlyActiveFilters[f] && getValueFunctions(filterMap[f]).isActive(f, filterMap[f].metadata, filterMap[f].value)
			))) : {}; // and if there's somehow no tab active, no filters are manually active in the current tab eh

			// Note: when a filter is implicitly active, it's never counted as active for any tab
			// Note: when a filter is active in the current tab, it's never counted as active for other tabs
			const numActiveFiltersPerTab: Record<string, number> = {};
			this.tabs.forEach(tab => {
				if (tab === activeTab) {
					numActiveFiltersPerTab[tab.tabname] = Object.keys(manuallyActiveFiltersInCurrentTab).length;
				} else {
					numActiveFiltersPerTab[tab.tabname] = tab.subtabs.reduce((num, subtab) => num + subtab.fields.filter(filter =>
						!implicitlyActiveFilters[filter] &&
						!manuallyActiveFiltersInCurrentTab[filter] &&
						getValueFunctions(filterMap[filter]).isActive(filter, filterMap[filter].metadata, filterMap[filter].value)
					).length, 0)
				}
			})
			return numActiveFiltersPerTab;
		},
	},
	created() {
		// Always set an active tab if there are any tabs at all
		// new tabs may be added just after setup, changing useTabs from false to true
		this.activeTab = this.tabs.length ? this.tabs[0].tabname : null;
	},
	watch: {
		tabs(cur, prev) {
			this.activeTab = cur.length ? cur[0].name : null;
		},
		activeTab: {
			immediate: true,
			handler(cur: string, prev: string) {
				const curQuery = this.tabs.find(t => t.tabname === cur)?.query;
				const prevQuery = this.tabs.find(t => t.tabname === prev)?.query;
				this.cancelFilterWatch.forEach(c => c());
				this.cancelFilterWatch = [];

				if (prevQuery) {
					Object.keys(prevQuery).forEach(id => FilterStore.actions.filterValue({id, value: null}));
				}

				if (curQuery) {
					const allFilters = FilterStore.getState().filters;
					Object.entries(curQuery).forEach(([id, value]) => {
						const filter = allFilters[id];
						const valueFuncs = getValueFunctions(filter);
						const actualValue = valueFuncs.decodeInitialState(
							id,
							filter.metadata,
							{ [id]: { id: id, values: value } },
							undefined as any
						);

						FilterStore.actions.filterValue({
							id,
							value: actualValue,
						});
						// filthy! Reactivate filter query on global form reset (which otherwise removes it)
						this.cancelFilterWatch.push(
							RootStore.store.watch(state => state.filters.filters[id].value, (cur, prev) => {
								if (cur != prev) {
									FilterStore.actions.filterValue({
										id,
										value: actualValue,
									});
								}
							})
						);
					});
				}
			}
		},
	},
	destroyed() {
		this.cancelFilterWatch.forEach(c => c());
		this.cancelFilterWatch = [];
	}
});
</script>

<style lang="scss">
.filter-container {
	max-height: 385px; // 5 fields @ 74px + 15px padding
	overflow: auto;
	overflow-x: hidden;
}
</style>