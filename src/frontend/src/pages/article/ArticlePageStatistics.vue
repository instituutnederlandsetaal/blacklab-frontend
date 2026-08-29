<template>
	<div class="row">
		<div v-if="statisticsTableData" class="col-xs-12 col-md-6">
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
			v-if="distributionAnnotation"
			:class="{
				'col-xs-12': true,
				'col-md-6': !!statisticsTableData,
			}"
			:snippet
			:annotation-id="distributionAnnotation.id"
			:chart-title="distributionAnnotation.displayName"
			:base-color
		/>

		<AnnotationGrowths v-if="growthAnnotations" class="col-xs-12" :snippet :annotations="growthAnnotations.annotations" :chart-title="growthAnnotations.displayName" :base-color />
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
import { computed, toRefs } from 'vue';

import * as ArticleStore from '@/features/article/model/article-state';
import type * as BLTypes from '@/types/blacklabtypes';

import AnnotationDistributions from '@/pages/article/AnnotationDistributions.vue';
import AnnotationGrowths from '@/pages/article/AnnotationGrowths.vue';

const props = defineProps<{
	snippet: BLTypes.BLHit;
	document: BLTypes.BLDocument;
	isPaginated: boolean;
}>();

const { baseColor, distributionAnnotation, growthAnnotations, statisticsTableFn } = toRefs(ArticleStore.getState());
const statisticsTableData = computed(() => statisticsTableFn.value?.(props.document, props.snippet));
</script>
