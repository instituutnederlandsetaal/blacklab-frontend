<template>
	<th :class="col.class" :style="col.style">
		<slot></slot>
		<SelectPicker v-if="Array.isArray(col.sort)"
			data-width="auto"
			data-menu-width="grow"
			data-class="btn-link"
			hideEmpty
			:menuHeading=" $t('results.sort.sortBy')"
			:title=" $t('results.sort.sortBy')"
			:placeholder="col.label"
			:options="col.sort"
			:disabled="disabled"
			@change="changeSort"
			:value="sort?.replace(/^-/, '') || null /* strip inverted sort value for display purposes */"
			:showValues="false"
		/>
		<a v-else-if="col.sort"
			role="button"
			:class="['sort', {disabled: disabled}]"
			:title="col.title"
			@click="changeSort(col.sort)"
		>
			{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug>
		</a>
		<span v-else :title="col.title">{{ col.label }} <debug><b>[{{ col.debugLabel || col.key }}]</b></debug></span>
	</th>
</template>
<script lang="ts">
import { ColumnDef } from '@/pages/search/results/table/table-layout';
import Vue from 'vue';
import SelectPicker from '@/components/SelectPicker.vue';
export default Vue.component('TableHeader', {
	components: { SelectPicker },
	props: {
		disabled: Boolean,
		col: Object as () => ColumnDef,
		sort: String
	},
	methods: {
		changeSort(sort: string) { this.$emit('changeSort', sort); }
	}
})
</script>

<style lang="scss">
th {
	.combobox {
		.menu-button {
			outline: none!important;
			padding: 0;
			font-weight: bold;
			text-decoration: none!important;
		}
		.menu-value.placeholder {
			color: inherit!important;
		}
		.combobox-menu {
			font-weight: normal;
		}
	}
}
</style>