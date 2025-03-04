<template>
	<tr class="grouprow rounded interactable">
		<td v-for="col in columns" :key="col.toString()">
			<template v-if="typeof col === 'string'">
				<template v-if="col.indexOf('relative') === -1">{{data[col] != null ? data[col].toLocaleString() : $t('results.groupBy.groupNameWithoutValue')}}</template> <!-- HACK! all division keys contain spaces for now, probably pretty slow too -->
				<template v-else>{{data[col] != null ? frac2Percent(typeof data[col] === 'string' ? 0 : data[col]) : $t('results.groupBy.groupNameWithoutValue')}}</template>
			</template>

			<div v-else class="progress group-size-indicator">
				<div class="progress-bar progress-bar-primary"
					:style="{
						'min-width': data[col[0]] ? frac2Percent(dataCol0(col) / maxima[col[0]]) : '100%',
						'opacity': data[col[0]] ? 1 : 0.5
					}">{{data[col[1]] ? (data[col[1]] ?? '').toLocaleString() : $t('results.groupBy.groupNameWithoutValue')}}</div>
			</div>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import frac2Percent from '@/mixins/fractionalToPercent';
import { GroupRowData } from '@/pages/search/results/table/groupTable';
export { GroupRowData } from '@/pages/search/results/table/groupTable';

export default Vue.extend({
	props: {
		data: Object as () => GroupRowData,
		// columns can represent 3 things: a barchart, indicated by an array of 2 keys, and a regular cell, indicated by a string
		columns: Array as () => Array<keyof GroupRowData|[keyof GroupRowData, keyof GroupRowData]>,
		maxima: Object as () => Record<keyof GroupRowData, number>,
	},
	methods: {
		frac2Percent,

		dataCol0(col: keyof GroupRowData|[keyof GroupRowData, keyof GroupRowData]): number {
			const key = Array.isArray(col) ? col[0] : col;
			const value = this.data[key];
			return typeof value === 'number' ? value : 0;
		}
	},
});
</script>

<style lang="scss" scoped>
</style>