<template>
	<tr class="grouprow rounded interactable">
		<td v-for="col in cols.groupColumns" :key="col.key" :colspan="col.colspan">
			<div v-if="col.barField" class="progress group-size-indicator">
				<div class="progress-bar progress-bar-primary" :style="barStyle(col)">
					{{row[col.labelField]?.toLocaleString() ?? $t('results.groupBy.groupNameWithoutValue')}}
				</div>
			</div>
			<template v-else>{{ valueForCell(col) }}</template>


			<!-- <template v-if="typeof col === 'string'">
				<template v-if="col.indexOf('relative') === -1">{{data[col] != null ? data[col].toLocaleString() : $t('results.groupBy.groupNameWithoutValue')}}</template>
				<template v-else>{{data[col] != null ? frac2Percent(typeof data[col] === 'string' ? 0 : data[col]) : $t('results.groupBy.groupNameWithoutValue')}}</template>
			</template>

			<div v-else class="progress group-size-indicator">
				<div class="progress-bar progress-bar-primary"
					:style="{
						'min-width': data[col[0]] ? frac2Percent(dataCol0(col) / maxima[col[0]]) : '100%',
						'opacity': data[col[0]] ? 1 : 0.5
					}">{{data[col[1]] ? (data[col[1]] ?? '').toLocaleString() : $t('results.groupBy.groupNameWithoutValue')}}</div>
			</div> -->
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import frac2Percent from '@/mixins/fractionalToPercent';
import { GroupRowData } from '@/pages/search/results/table/groupTable';
import { ColumnDefGroup, ColumnDefs, Maxima } from '@/utils/hit-highlighting';
export { GroupRowData } from '@/pages/search/results/table/groupTable';

export default Vue.extend({
	props: {
		row: Object as () => GroupRowData,
		// columns can represent 3 things: a barchart, indicated by an array of 2 keys, and a regular cell, indicated by a string
		cols: Object as () => ColumnDefs, // Array<keyof GroupRowData|[keyof GroupRowData, keyof GroupRowData]>,
		maxima: Object as () => Maxima
	},
	methods: {
		frac2Percent,
		barStyle(col: ColumnDefGroup): Record<string, string> {
			if (!col.barField || this.row[col.barField] == null) return { minWidth: '100%', opacity: '0.5' }
			return { minWidth: this.frac2Percent(this.row[col.barField]! / this.maxima[col.barField])}
		},
		valueForCell(col: ColumnDefGroup): string {
			const v = this.row[col.labelField];
			if (v == null) return this.$t('results.groupBy.groupNameWithoutValue').toString();
			if (col.showAsPercentage && typeof v === 'number') return this.frac2Percent(v);
			return v.toLocaleString();
		}

		// dataCol0(col: keyof GroupRowData|[keyof GroupRowData, keyof GroupRowData]): number {
		// 	const key = Array.isArray(col) ? col[0] : col;
		// 	const value = this.data[key];
		// 	return typeof value === 'number' ? value : 0;
		// }
	},
});
</script>

<style lang="scss" scoped>
</style>