<template>
	<div>
		<div class="crumbs-totals">
			<slot name="breadcrumbs"/>
			<slot name="totals"/>
		</div>
		<slot name="groupBy"/>
		<slot name="pagination"/>
		<slot name="annotation-switcher"/>

		<div class="form-group">
			<div class="btn-group" style="margin: auto;">
				<button v-for="option in cols.groupModeOptions"
					type="button"
					:class="['btn btn-default btn-sm', {'active': info.groupDisplayMode === option}]"
					:key="option"
					@click="changeGroupDisplayMode(option)"
				>{{option}}</button>
			</div>
		</div>

		<GenericTable class="group-table"
			:cols="cols"
			:rows="rows"
			:info="info"
			:disabled="disabled"
			:type="type"
			:query="query"
			:header="cols.groupColumns"

			@changeSort="changeSort"
			@openFullConcordances="openFullConcordances"
		/>

		<hr>
		<div class="text-right">
			<slot name="sort"/>
			<slot name="export"/>
		</div>

	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as BLTypes from '@/types/blacklabtypes';

import GroupTable from '@/pages/search/results/table/GroupTable.vue';
import SelectPicker from '@/components/SelectPicker.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/pages/search/results/table/table-layout';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';

export default Vue.extend({
	components: { SelectPicker, GroupTable, GenericTable },

	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		sort: String as () => null|string,
		disabled: Boolean,

		type: String as () => 'hits'|'docs',
		query: Object as () => BLTypes.BLSearchParameters,
	},
	methods: {
		changeSort(payload: string) {
			if (!this.disabled) {
				this.$emit('sort', payload === this.sort ? '-'+payload : payload);
			}
		},
		openFullConcordances(id: string, displayName: string) {
			if (!this.disabled) {
				this.$emit('viewgroup', {id, displayName});
			}
		},
		changeGroupDisplayMode(payload: string) {
			if (!this.disabled) {
				this.$emit('groupDisplayMode', payload)
			}
		},
	},
});
</script>

<style lang="scss">

.group-table {
	table-layout: auto;

	th {
		vertical-align: top;
	}
}

</style>
