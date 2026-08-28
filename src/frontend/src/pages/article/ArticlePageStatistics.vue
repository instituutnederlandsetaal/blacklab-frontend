<template>
	<div class="row">
		<div
			v-if="statisticsTableData"
			:class="{
				'col-xs-12': true,
				'col-md-6': !!statisticsTableData,
			}"
		>
			<table class="table" style="table-layout: auto; width: 100%">
				<thead>
					<tr>
						<th colspan="2" class="text-center">Document Statistics<template v-if="isPaginated"> (current page)</template></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(value, key) in statisticsTableData" :key="key">
						<td>
							<strong>{{ key }}</strong>
						</td>
						<td>{{ value }}</td>
					</tr>
				</tbody>
			</table>
		</div>

		<AnnotationDistributions
			v-if="distributionData"
			:class="{
				'col-xs-12': true,
				'col-md-6': !!statisticsTableData,
			}"
			:snippet
			v-bind="distributionData"
		/>

		<AnnotationGrowths v-if="growthData" class="col-xs-12" :snippet v-bind="growthData" />
	</div>
</template>

<script lang="ts">
import * as Highcharts from 'highcharts';
import HighchartsBoost from 'highcharts/modules/boost';
import HighchartsExportingData from 'highcharts/modules/export-data';
import HighchartsExporting from 'highcharts/modules/exporting';

HighchartsExporting(Highcharts);
HighchartsExportingData(Highcharts);
HighchartsBoost(Highcharts);
</script>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';

import * as ArticleStore from '@/features/article/model/article-state';
import type * as BLTypes from '@/types/blacklabtypes';

import AnnotationDistributions from '@/pages/article/AnnotationDistributions.vue';
import AnnotationGrowths from '@/pages/article/AnnotationGrowths.vue';

const props = defineProps({
	snippet: { type: Object as PropType<BLTypes.BLHit>, required: true },
	document: { type: Object as PropType<BLTypes.BLDocument>, required: true },
	isPaginated: Boolean,
});

const baseColor = computed(ArticleStore.get.baseColor);

const statisticsTableData = computed(() => {
	const fn = ArticleStore.get.statisticsTableFn();
	return fn && fn(props.document, props.snippet);
});

const distributionData = computed(() => {
	const data = ArticleStore.get.distributionAnnotation();
	return data
		? {
				annotationId: data.id,
				chartTitle: data.displayName,
				baseColor: baseColor.value,
			}
		: null;
});

const growthData = computed(() => {
	const data = ArticleStore.get.growthAnnotations();
	return data
		? {
				annotations: data.annotations,
				chartTitle: data.displayName,
				baseColor: baseColor.value,
			}
		: null;
});
</script>

<style lang="scss">
// Only contains styles for classes used in the built in xsl files (article_tei.xsl, article_folia.xsl). And some styles for the navigation controls (next hit, next page)
</style>
