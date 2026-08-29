<template>
	<th :class="col.class" :style="col.style">
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
import type { ColumnDef } from '@/pages/search/results/table/table-layout';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

defineProps<{
	disabled: boolean;
	col: ColumnDef;
	sort?: string | null;
}>();
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
