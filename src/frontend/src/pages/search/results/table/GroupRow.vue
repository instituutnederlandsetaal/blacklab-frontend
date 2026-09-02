<template>
	<tr class="grouprow">
		<td v-for="col in cols.groupColumns" :key="col.key" :colspan="col.colspan" :class="col.class" :style="col.style">
			<div v-if="col.barField" class="progress group-size-indicator">
				<div class="progress-bar progress-bar-primary" :style="barStyle(col)">
					{{ valueForCell(col) }}
				</div>
			</div>
			<button
				v-else-if="col.labelField === 'displayname' && detailsEnabled"
				type="button"
				class="group-details-toggle"
				:aria-expanded="open ? 'true' : 'false'"
				:aria-controls="detailsId"
				@click.stop="emit('toggle')"
			>
				<span class="fa fa-angle-right" aria-hidden="true"></span>
				{{ valueForCell(col) }}
			</button>
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
const emit = defineEmits<{ toggle: [] }>();

const translate = useI18n();

function barStyle(col: ColumnDefGroup): Record<string, string> {
	if (!col.barField) return {};
	const value = props.row[col.barField];
	const maximum = props.maxima?.[col.barField];
	if (typeof value !== 'number' || !Number.isFinite(value) || typeof maximum !== 'number' || !Number.isFinite(maximum) || maximum <= 0) return { minWidth: '0' };
	return { minWidth: frac2Percent(Math.max(0, value) / maximum) };
}
function valueForCell(col: ColumnDefGroup): string {
	const v = props.row[col.labelField];
	if (v == null) return col.labelField === 'displayname' ? translate.$t('results.groupBy.groupNameWithoutValue').toString() : '—';
	if (col.showAsPercentage && typeof v === 'number') return frac2Percent(v);
	return v.toLocaleString();
}
</script>

<style lang="scss">
.grouprow > td {
	border-bottom: 2px solid transparent;
}

.group-details-toggle {
	border: 0;
	background: transparent;
	color: inherit;
	padding: 0;
	text-align: inherit;

	.fa {
		margin-right: 0.35em;
		transition: transform 0.1s;
	}

	.grouprow.open & .fa {
		transform: rotate(90deg);
	}
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
