<template>
	<tr class="grouprow rounded interactable">
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
import { GroupRowData } from '@/pages/search/results/table/groupTable';
import { ColumnDefGroup, ColumnDefs, Maxima } from '@/utils/hit-highlighting';
export { GroupRowData } from '@/pages/search/results/table/groupTable';

export default Vue.extend({
	props: {
		row: Object as () => GroupRowData,
		cols: Object as () => ColumnDefs,
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
	},
});
</script>

<style lang="scss" scoped>
</style>