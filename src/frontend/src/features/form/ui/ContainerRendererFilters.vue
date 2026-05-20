<template>
	<section :class="containerClasses">
		<header v-if="node.title" class="blf-container-title">{{ node.title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', node.config?.variant === 'small-tabs' ? 'small' : '']" aria-label="Form section tabs">
				<button v-for="child in node.children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChildContainer(child.id)">
					{{ child.title || child.id }}
					<span v-if="activeFiltersMap[child.id]" class="badge">{{ activeFiltersMap[child.id] }}</span>
				</button>
			</nav>
			<div class="blf-tab-panel">
				<NodeRenderer v-if="activeChild" :node="activeChild" />
			</div>
		</template>

		<div v-else-if="node.children.length" class="blf-container-list">
			<NodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
		</div>
		<!-- TODO i18n -->
		<div v-else class="empty">No filters configured.</div>
	</section>

	<!-- <template v-if="useTabs">
		<nav class="blf-tabs small">
			<button v-for="tab in groups" :key="tab.id" type="button" :class="{ active: activeTabModel === tab.id }" @click="activeTabModel = tab.id">
				{{ tab.title || 'Common' }}
				<span v-if="activeFiltersMap[tab.id]" class="badge">{{ activeFiltersMap[tab.id] }}</span>
			</button>
		</nav>

		<div class="filter-container">
			<template v-for="(subtab, index) in activeGroup?.subtabs || []" :key="subtab.id">
				<h4 v-if="subtab.title">{{ subtab.title }}</h4>
				<hr v-else-if="index !== 0" />
				<Component
					v-for="id in subtab.fields"
					:key="id"
					:is="componentFor(filters[id])"
					:html-id="`filter_${id}`"
					:definition="filters[id]"
					:text-direction="textDirection"
					:model-value="values[id]"
					@update:model-value="updateFilterValue(id, $event)"
				/>
			</template>
		</div>
	</template>
	<div v-else-if="allFilters.length" class="filter-container">
		<Component
			v-for="filter in allFilters"
			:key="filter.id"
			:is="componentFor(filter)"
			:html-id="`filter_${filter.id}`"
			:definition="filter"
			:text-direction="textDirection"
			:model-value="values[filter.id]"
			@update:model-value="updateFilterValue(filter.id, $event)"
		/>
	</div>
	<div v-else class="empty">No filters configured.</div> -->
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { isContainerNode } from '@/features/form/model/form-utils';
import { useParentForm } from '@/features/form/model/runtime';
import type { FormContainerNode } from '@/features/form/model/types/form-shape';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';

import FilterAutocomplete from '../fields/filters/FilterAutocomplete.vue';
import FilterCheckbox from '../fields/filters/FilterCheckbox.vue';
import FilterDate from '../fields/filters/FilterDate.vue';
import FilterRadio from '../fields/filters/FilterRadio.vue';
import FilterRange from '../fields/filters/FilterRange.vue';
import FilterRangeMultipleFields from '../fields/filters/FilterRangeMultipleFields.vue';
import FilterSelect from '../fields/filters/FilterSelect.vue';
import FilterText from '../fields/filters/FilterText.vue';
import NodeRenderer from '@/features/form/ui/NodeRenderer.vue';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<{
	node: FormContainerNode;
}>();

const { runtime, isTabbed, activeChild, containerClasses, activateChildContainer } = containerRendererSetup(props);
const parentForm = useParentForm();

const childGroups = computed<Set<string>>(() => new Set(props.node.children.filter(isContainerNode).map(child => child.id)));

// TODO need to filter descendants to filters only. Might need to manually traverse and collect?
// Should probably just improve the automatic summary system to support this natively.
// also assumes that the summaries include the group id, which might not be the case.
const activeFiltersMap = computed<Record<string, number>>(() =>
	parentForm.summaries.reduce<Record<string, number>>((acc, summary) => {
		if (summary.group != null && childGroups.value.has(summary.group) && summary.value) {
			acc[summary.group] = (acc[summary.group] ?? 0) + 1;
		}
		return acc;
	}, {}),
);

const components = {
	'filter-autocomplete': FilterAutocomplete,
	'filter-checkbox': FilterCheckbox,
	'filter-date': FilterDate,
	'filter-radio': FilterRadio,
	'filter-range': FilterRange,
	'filter-range-multiple-fields': FilterRangeMultipleFields,
	'filter-select': FilterSelect,
	'filter-text': FilterText,
};
</script>

<style lang="scss" scoped>
.blf-filter-panel {
	display: grid;
	gap: 10px;
}

header {
	font-weight: 700;
}

.filter-container {
	display: grid;
	gap: 12px;
	max-height: 385px;
	overflow: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

h4 {
	font-size: 0.95em;
	margin: 0;
}

hr {
	border: 0;
	border-top: 1px solid var(--blf-border);
	width: 100%;
}

.badge {
	display: inline-block;
	min-width: 1.5em;
	border-radius: 999px;
	background: var(--blf-accent-soft);
	padding: 1px 6px;
	font-size: 0.85em;
}

.empty {
	color: var(--blf-text-muted);
	font-style: italic;
}
</style>
