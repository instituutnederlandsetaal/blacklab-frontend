<template>
	<div>

		<div class="crumbs-totals">
			<slot name="breadcrumbs"/>
			<slot name="totals"/>
		</div>

		<slot name="groupBy"/>
		<slot name="pagination"/>
		<slot name="annotation-switcher"/>

		<GenericTable class="hits-table"
			:cols="cols"
			:rows="rows"
			:info="info"
			:header="cols.hitColumns"
			:showTitles="showTitles"
			type="hits"

			:disabled="disabled"
			@changeSort="changeSort"
		/>
		<hr>

		<div class="bottom-layout">
			<slot name="pagination"/>
			<div class="spacer"></div>

			<slot name="sort"/>
			<button
				type="button"
				class="btn btn-primary btn-sm show-titles"

				@click="showTitles = !showTitles"
			>
				{{showTitles ? $t('results.table.hide') : $t('results.table.show')}} {{ $t('results.table.titles') }}
			</button>
			<slot name="export"/>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/pages/search/results/table/table-layout';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';

export default Vue.extend({
	components: {
		GenericTable
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		sort: String as () => string|null,
		disabled: Boolean
	},
	data: () => ({
		showTitles: true
	}),
	methods: {
		changeSort(payload: string) {
			if (!this.disabled) {
				this.$emit('sort', payload === this.sort ? '-'+payload : payload);
			}
		},
	},
});
</script>


<!-- gruwelijk, Jesse -->
<style lang="css">
.capture {
	border-style: solid;
	border-color: goldenrod;
}

.gloss_field_heading {
	font-style: italic
}
</style>
<style lang="scss" scoped>

.bottom-layout {
	display: flex;
	align-items: center;
	.spacer {
		flex-grow: 1;
	}
	.show-titles {
		margin: 0 0.5em;
	}
}

</style>
