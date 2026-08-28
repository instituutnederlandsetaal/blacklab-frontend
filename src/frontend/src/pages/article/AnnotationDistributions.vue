<template>
	<Chart v-if="chartOptions" :options="chartOptions" />
</template>

<script setup lang="ts">
import * as Highcharts from 'highcharts';
import { Chart } from 'highcharts-vue';
import { computed } from 'vue';

import type * as BLTypes from '@/types/blacklabtypes';

import { chartColors } from './chart-colors';

const props = defineProps<{
	snippet?: BLTypes.BLHitInDoc;
	baseColor?: string;
	annotationId?: string;
	chartTitle?: string;
}>();

const distribution = computed<null | Array<{
	y: number;
	name: string;
	color?: string;
}>>(() => {
	if (!props.annotationId) return null;
	const values = props.snippet?.match[props.annotationId];
	if (!values?.length) {
		console.warn(`[Distribution Pie-Chart] - No values found for annotation ID: ${props.annotationId}`);
		return null;
	}

	const occurrances = values.reduce((acc, v) => ((acc[v] = (acc[v] || 0) + 1), acc), {} as { [key: string]: number });
	return Object.entries(occurrances)
		.map(([key, count]) => ({
			y: count,
			name: key,
		}))
		.sort((a, b) => b.y - a.y);
});

const chartOptions = computed<null | Highcharts.Options>(() => {
	if (!distribution.value) return null;
	return {
		title: {
			text: props.chartTitle || props.annotationId,
		},
		series: [
			{
				type: 'pie',
				data: distribution.value,
				allowPointSelect: true,
				animation: true,
				dataLabels: {
					format: '<b>{point.name}</b>: {point.percentage:.1f} %',
				},
				colors: chartColors(props.baseColor, distribution.value.length),
			},
		] as Highcharts.SeriesPieOptions[],
		tooltip: {
			animation: false,
			pointFormat: '<span style="color:{point.color}">\u25CF</span> <b> {point.y:,.0f} ({point.percentage:.1f}%)</b>',
			shadow: false,
		},
	};
});
</script>
