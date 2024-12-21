<template>
	<div class="row">
		<span v-if="isLoading" class="fa fa-spinner fa-spin text-center" style="font-size: 60px; display: block; margin: auto;"></span>
		<div v-else-if="error" class="text-center">
			<h3 class="text-danger"><em>{{error.message}}</em></h3>
			<br>
			<button type="button" class="btn btn-lg btn-default" @click="error = null; load()">Retry</button>
		</div>
		<h4 v-else-if="!isEnabled" class="text-muted text-center">
			<em>No statistics have been configured for this corpus.</em>
		</h4>
		<template v-else>
			<div v-if="statisticsTableData"
				:class="{
					'col-xs-12': true,
					'col-md-6': !!statisticsTableData
				}"
			>
				<table class="table" style="table-layout: auto; width: 100%;">
					<thead>
						<tr><th colspan="2" class="text-center">Document Statistics</th></tr>
					</thead>
					<tbody>
						<tr v-for="(value, key) in statisticsTableData" :key="key">
							<td><strong>{{key}}</strong> </td><td>{{value}}</td>
						</tr>
					</tbody>
				</table>
			</div>

			<AnnotationDistributions v-if="snippet && distributionData"
				:class="{
					'col-xs-12': true,
					'col-md-6': !!statisticsTableData
				}"
				:snippet="snippet"
				v-bind="distributionData"
			/>

			<AnnotationGrowths v-if="snippet && growthData" class="col-xs-12" :snippet="snippet" v-bind="growthData"/>
		</template>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as ArticleStore from '@/store/article';
import {blacklab} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';

import AnnotationDistributions from '@/pages/article/AnnotationDistributions.vue';
import AnnotationGrowths from '@/pages/article/AnnotationGrowths.vue';

import * as Highcharts from 'highcharts';
import HighchartsVue from 'highcharts-vue';
import HighchartsExporting from 'highcharts/modules/exporting';
import HighchartsExportingData from 'highcharts/modules/export-data';
import HighchartsBoost from 'highcharts/modules/boost';


HighchartsExporting(Highcharts);
HighchartsExportingData(Highcharts);
HighchartsBoost(Highcharts);
Vue.use(HighchartsVue);

function _preventClicks(e: Event) {
	e.preventDefault();
	e.stopPropagation();
	return false;
}

export default Vue.extend({
	components: {
		AnnotationDistributions,
		AnnotationGrowths,
	},
	data: () => ({
		request: null as null|Promise<BLTypes.BLHitSnippet>,
		snippet: null as null|BLTypes.BLHitSnippet,
		error: null as null|AppTypes.ApiError,
	}),
	computed: {
		isEnabled: ArticleStore.get.statisticsEnabled,
		docIdFromRoute(): string|undefined {
			return this.$route.params.docId
		},

		document: ArticleStore.get.document,
		baseColor: ArticleStore.get.baseColor,

		getStatistics: ArticleStore.get.statisticsTableFn,
		statisticsTableData(): any {
			return (this.getStatistics && this.document && this.snippet) ?
				this.getStatistics(this.document, this.snippet) : null;
		},
		distributionData(): any {
			const data = ArticleStore.get.distributionAnnotation();
			return data ? {
				annotationId: data.id,
				chartTitle: data.displayName,
				baseColor: this.baseColor
			} : null;
		},
		growthData(): any {
			const data = ArticleStore.get.growthAnnotations();
			return data ? {
				annotations: data.annotations,
				chartTitle: data.displayName,
				baseColor: this.baseColor
			} : null;
		},

		isLoading(): boolean { return this.request != null; }
	},
	methods: {
		load(): void {
			if (this.snippet || this.error || this.request || !this.isEnabled) {
				return;
			}

			const annotatedFieldName = ArticleStore.getState().field || undefined;
			this.request = blacklab.getSnippet(ArticleStore.getState().indexId, ArticleStore.getState().docId!, annotatedFieldName, 0, this.document!.docInfo.lengthInTokens, 0)
			.then(snippet => this.snippet = snippet)
			.catch(error => this.error = error)
			.finally(() => this.request = null);
		}
	},
});

</script>

<style lang="scss">
// Only contains styles for classes used in the built in xsl files (article_tei.xsl, article_folia.xsl). And some styles for the navigation controls (next hit, next page)

.hl {
	font-weight: bold;
	background-color: #e4ebef; //#ffe1bc;
	color: #464646;

	&.active {
		/*text-decoration: underline;*/
		color: #fff;
		background-color: #337ab7;
	}
}

.word, .tooltip-hover {
	// Defined in main.css in the main webapp
	font-family: "Helvetica Neue", "Helvetica", "Arial,sans-serif", "Inl vmnw wnt";
}

.p,
.paragraph {
	display: block;
	margin: 0 0 10px;
}

.linenumber {
	color: #aaaaaa;
	font-weight: bold;
}

// Metadata table
#metadata td,
#metadata th {
	vertical-align: top;
}

</style>
