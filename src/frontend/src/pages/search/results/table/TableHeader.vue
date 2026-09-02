<template>
	<th :class="col.class" :style="col.style" :aria-sort="ariaSort">
		<slot></slot>
		<SelectPicker
			v-if="Array.isArray(col.sort)"
			data-width="auto"
			data-menu-width="grow"
			data-class="btn-link"
			hideEmpty
			:menuHeading="$t('results.sort.sortBy')"
			:title="$t('results.sort.sortBy')"
			:placeholder="col.label"
			:options="col.sort"
			:disabled="disabled"
			@change="sort => emit('changeSort', sort)"
			:modelValue="sort?.replace(/^-/, '') || null /* strip inverted sort value for display purposes */"
			:showValues="false"
		/>
		<a v-else-if="col.sort" role="button" :class="['sort', { disabled: disabled }]" :title="col.title" @click="emit('changeSort', col.sort)">
			{{ col.label }}
			<span v-if="isActiveSort" :class="['fa', sort?.startsWith('-') ? 'fa-sort-down' : 'fa-sort-up']" aria-hidden="true"></span>
			<span v-if="isActiveSort" class="sr-only">{{ $t(sort?.startsWith('-') ? 'results.table.sortedDescending' : 'results.table.sortedAscending') }}</span>
			<debug
				><b>[{{ col.debugLabel || col.key }}]</b></debug
			>
		</a>
		<span v-else :title="col.title"
			>{{ col.label }}
			<debug
				><b>[{{ col.debugLabel || col.key }}]</b></debug
			></span
		>
	</th>
</template>
<script setup lang="ts">
import { computed } from 'vue';

import type { ColumnDef } from '@/pages/search/results/table/table-layout';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<{
	disabled: boolean;
	col: ColumnDef;
	sort?: string | null;
}>();
const isActiveSort = computed(() => typeof props.col.sort === 'string' && props.sort?.replace(/^-/, '') === props.col.sort.replace(/^-/, ''));
const ariaSort = computed(() => (isActiveSort.value ? (props.sort?.startsWith('-') ? 'descending' : 'ascending') : undefined));
const emit = defineEmits<{
	changeSort: [sort: string];
}>();
</script>

<style lang="scss">
th {
	.combobox {
		.menu-button {
			outline: none !important;
			padding: 0;
			font-weight: bold;
			text-decoration: none !important;
		}
		.menu-value.placeholder {
			color: inherit !important;
		}
		.combobox-menu {
			font-weight: normal;
		}
	}
}
</style>
