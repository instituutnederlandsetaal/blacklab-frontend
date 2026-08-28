<template>
	<Chart v-if="snippet" :options="chartOptions" />
</template>

<script setup lang="ts">
import { stripIndent } from 'common-tags';
import * as Highcharts from 'highcharts';
import { Chart } from 'highcharts-vue';
import { computed } from 'vue';
import type { PropType } from 'vue';

import type * as BLTypes from '@/types/blacklabtypes';

import { chartColors } from './chart-colors';

const props = defineProps({
	snippet: { type: Object as PropType<BLTypes.BLHitInDoc>, required: true },
	annotations: Array as PropType<
		Array<{
			id: string;
			displayName?: string;
		}>
	>,
	chartTitle: { type: String, default: 'Growths' },
	baseColor: String,
});

const growth = computed<Highcharts.SeriesLineOptions[]>(() => {
	if (!props.annotations || props.annotations.length === 0) return [];

	return props.annotations.map((annot): Highcharts.SeriesLineOptions => {
		let uniques = 0;
		const seen = {} as { [key: string]: boolean };

		const values = props.snippet.match[annot.id];
		const invLength = 100 / (values.length + 1);

		return {
			type: 'line',
			name: annot.displayName || annot.id,
			boostThreshold: 250,
			keys: ['name', 'x', 'x2', 'y', 'y2'],
			data: (() => {
				const ret: any[][] = values.map((v, i) => [v, i + 1, (i + 1) * invLength, seen[v] ? uniques : ((seen[v] = true), ++uniques)]);
				const invUniques = 100 / uniques;
				ret.forEach(r => r.push(r[3] * invUniques));
				return ret as Array<[string, number]>; // highchart typings aren't fully correct with what's actually supported, do some casting so we "comply"
			})(),
		};
	});
});

const chartOptions = computed<Highcharts.Options>(() => ({
	title: {
		text: props.chartTitle || '',
	},
	boost: {
		useGPUTranslations: true,
		enabled: true,
	},
	chart: {
		animation: false,
		zoomType: 'x',
	},
	colors: chartColors(props.baseColor, props.annotations ? props.annotations.length : 1),
	tooltip: {
		animation: false,
		shadow: false,
		shared: false,
		useHTML: true,
		headerFormat: '<table class="table"><tbody>',
		pointFormat: stripIndent`
						<tr>
							<th colspan="3"><h3>{point.name} </h3></th>
						</tr>
						<tr>
							<th>Unique {series.name}: </th>
							<td> {point.y} </td>
							<td> ({point.y2:,.1f} %) </td>
						</tr>
						<tr>
							<th>Progress: </th>
							<td> {point.x} tokens </td>
							<td> ({point.x2:,.1f} %) </td>
						</tr>
		`,
		footerFormat: '</tbody></table>',
		followPointer: false,
	},
	series: growth.value,
}));
</script>

<style lang="scss">
.highcharts-tooltip table {
	table-layout: auto;
	width: auto;

	td {
		padding: 4px 6px;
	}
}
</style>
