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

		<GroupTable
			:cols="cols"
			:rows="rows"
			:info="info"
			:disabled="disabled"
			:type="type"
			:query="query"

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
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/utils/hit-highlighting';

export default Vue.extend({
	components: { SelectPicker, GroupTable },

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

.grouprow {
	border-bottom: 2px solid transparent;
}

.group-size-indicator {
	cursor: pointer;
	margin: 0;

	background: linear-gradient(to right, hsla(0, 0%, 91%, 1) 40%, white 100%);

	&:hover {
		background: #d8d8d8;
	}

	> .progress-bar {
		background-image: linear-gradient(to right, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0) 250px);
		// Do not shrink smaller than the text inside the bar.
		// Greater widths are set using min-width.
		padding: 0px 2px;
		width: auto;
		white-space: nowrap;
	}
}

.concordance-controls {
	margin-bottom: 8px;
}

.well-light {
	background: rgba(255,255,255,0.8);
	border: 1px solid #e8e8e8;
	border-radius: 4px;
	box-shadow: inset 0 1px 2px 0px rgba(0,0,0,0.1);
	margin-bottom: 8px;
	padding: 8px
}

</style>
