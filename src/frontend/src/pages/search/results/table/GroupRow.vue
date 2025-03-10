<template>
	<tr class="grouprow">
		<td v-for="col in cols.groupColumns" :key="col.key" :colspan="col.colspan">
			<div v-if="col.barField" class="progress group-size-indicator">
				<div class="progress-bar progress-bar-primary" :style="barStyle(col)">
					{{row[col.labelField]?.toLocaleString() ?? $t('results.groupBy.groupNameWithoutValue')}}
				</div>
			</div>
			<template v-else>{{ valueForCell(col) }}</template>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import frac2Percent from '@/mixins/fractionalToPercent';
import { ColumnDefGroup, ColumnDefs, GroupRowData, Maxima } from '@/pages/search/results/table/table-layout';

export default Vue.component('GroupRow', {
	props: {
		row: Object as () => GroupRowData,
		cols: Object as () => ColumnDefs,
		maxima: Object as () => Maxima
	},
	methods: {
		frac2Percent,
		barStyle(col: ColumnDefGroup): Record<string, string> {
			// if (!col.barField || this.row[col.barField] == null) return { width: '0', minWidth: '0', maxWidth: '0', padding: '0', color: 'black', textShadow: 'none', marginLeft: '6px', fontWeight: 'bold', overflow: 'visible', opacity: '0.8' }
			if (!col.barField || this.row[col.barField] == null) return { width: '100%', opacity: '0.8' }
			return { minWidth: this.frac2Percent(this.row[col.barField]! / this.maxima[col.barField])}
		},
		valueForCell(col: ColumnDefGroup): string {
			const v = this.row[col.labelField];
			if (v == null) return this.$t('results.groupBy.groupNameWithoutValue').toString();
			if (col.showAsPercentage && typeof v === 'number') return this.frac2Percent(v);
			return v.toLocaleString();
		}
	},
});
</script>

<style lang="scss">

.grouprow > td {
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

</style>