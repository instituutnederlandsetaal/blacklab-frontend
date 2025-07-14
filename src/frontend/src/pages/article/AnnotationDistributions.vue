<template>
	<highcharts v-if="distribution?.length" :options="chartOptions"/>
</template>

<script lang="ts">
import Vue from 'vue';
import * as Highcharts from 'highcharts';

import * as BLTypes from '@/types/blacklabtypes';

export default Vue.extend({
	props: {
		snippet: Object as () => BLTypes.BLHitSnippet,
		baseColor: String,
		annotationId: String,
		chartTitle: String
	},
	computed: {
		distribution(): null|Array<{
			y: number,
			name: string,
			color?: string
		}> {
			if (!this.annotationId) return null;
			if (!this.snippet?.match[this.annotationId]?.length) {
				console.warn(`[Distribution Pie-Chart] - No values found for annotation ID: ${this.annotationId}`);
				return null;
			}

			const values = this.snippet.match[this.annotationId];
			const occurrances = values.reduce((acc, v) => (acc[v] = (acc[v] || 0) + 1, acc), {} as {[key: string]: number});
			return Object.entries(occurrances)
			.map(([key, count]) => ({
				y: count,
				name: key,
			}))
			.sort((a, b) => b.y - a.y);
		},

		chartOptions(): null|Highcharts.Options {
			if (!this.distribution) return null;
			return {
				title: {
					text: this.chartTitle || this.annotationId
				},
				series: [{
					type: 'pie',
					data: this.distribution,
					allowPointSelect: true,
					animation: true,
					dataLabels: {
						format: '<b>{point.name}</b>: {point.percentage:.1f} %',
					},
					colors: (() => {
						const colors = [];
						const base = this.baseColor;
						const numColors = Math.min(20, this.distribution.length);

						for (let i = 0; i < numColors; i += 1) {
							// Start out with a darkened base color (negative brighten), and end
							// up with a much brighter color
							colors.push((Highcharts as any).Color(base).brighten(-0.4 + i / ((numColors+1) * 0.7)).get());
						}
						return colors;
					})(),
				}] as Highcharts.SeriesPieOptions[],
				tooltip: {
					animation: false,
					pointFormat: '<span style="color:{point.color}">\u25CF</span> <b> {point.y:,.0f} ({point.percentage:.1f}%)</b>',
					shadow: false,
				}
			};
		}
	},
});

</script>

<style lang="scss">

</style>
