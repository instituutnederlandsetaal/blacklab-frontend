<template>
	<tr class="grouprow">
		<td v-for="col in cols.groupColumns" :key="col.key" :colspan="col.colspan" :class="col.class" :style="col.style">
			<div v-if="col.barField" class="progress group-size-indicator">
				<div class="progress-bar progress-bar-primary" :style="barStyle(col)">
					{{ row[col.labelField]?.toLocaleString() ?? $t('results.groupBy.groupNameWithoutValue') }}
				</div>
			</div>
			<template v-else>{{ valueForCell(col) }}</template>
		</td>
	</tr>
</template>

<script setup lang="ts">
import type { IRowProps } from '@/pages/search/results/table/IRow';
import type { ColumnDefGroup, GroupRowData } from '@/pages/search/results/table/table-layout';

import { useI18n } from '@/shared/i18n';
import { frac2Percent } from '@/shared/utils/number-utils';

const props = defineProps<IRowProps<GroupRowData>>();

const translate = useI18n();

function barStyle(col: ColumnDefGroup): Record<string, string> {
	// if (!col.barField || this.row[col.barField] == null) return { width: '0', minWidth: '0', maxWidth: '0', padding: '0', color: 'black', textShadow: 'none', marginLeft: '6px', fontWeight: 'bold', overflow: 'visible', opacity: '0.8' }
	if (!col.barField || props.row[col.barField] == null) return { width: '100%', opacity: '0.8' };
	return { minWidth: frac2Percent(props.row[col.barField]! / props.maxima![col.barField]) };
}
function valueForCell(col: ColumnDefGroup): string {
	const v = props.row[col.labelField];
	if (v == null) return translate.$t('results.groupBy.groupNameWithoutValue').toString();
	if (col.showAsPercentage && typeof v === 'number') return frac2Percent(v);
	return v.toLocaleString();
}
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
		background-image: linear-gradient(to right, rgba(0, 0, 0, 0.15) 0px, rgba(0, 0, 0, 0) 250px);
		// Do not shrink smaller than the text inside the bar.
		// Greater widths are set using min-width.
		padding: 0px 2px;
		width: auto;
		white-space: nowrap;
	}
}
</style>
