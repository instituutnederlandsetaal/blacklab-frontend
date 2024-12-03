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

import * as RootStore from '@/store/article';
import {blacklab} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';

import AnnotationDistributions from '@/pages/article/AnnotationDistributions.vue';
import AnnotationGrowths from '@/pages/article/AnnotationGrowths.vue';

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
		document: RootStore.get.document,
		baseColor: RootStore.get.baseColor,

		getStatistics: RootStore.get.statisticsTableFn,
		statisticsTableData(): any {
			return (this.getStatistics && this.document && this.snippet) ?
				this.getStatistics(this.document, this.snippet) : null;
		},
		distributionData(): any {
			const data = RootStore.get.distributionAnnotation();
			return data ? {
				annotationId: data.id,
				chartTitle: data.displayName,
				baseColor: this.baseColor
			} : null;
		},
		growthData(): any {
			const data = RootStore.get.growthAnnotations();
			return data ? {
				annotations: data.annotations,
				chartTitle: data.displayName,
				baseColor: this.baseColor
			} : null;
		},

		isEnabled(): boolean { return !!(this.getStatistics || this.distributionData || this.growthData); },
		isLoading(): boolean { return this.request != null; }
	},
	methods: {
		load(): void {
			if (this.snippet || this.error || this.request || !this.isEnabled) {
				return;
			}

			const annotatedFieldName = RootStore.getState().field || undefined;
			this.request = blacklab.getSnippet(RootStore.getState().indexId, RootStore.getState().docId, annotatedFieldName, 0, this.document!.docInfo.lengthInTokens, 0)
			.then(snippet => this.snippet = snippet)
			.catch(error => this.error = error)
			.finally(() => this.request = null);
		}
	},
	watch: {
		isEnabled: {
			immediate: true,
			handler(v: boolean) {
				const statsTab = (document.querySelector('a[href="#statistics"]') as HTMLAnchorElement);
				if (v) {
					statsTab.classList.remove('disabled');
					statsTab.removeEventListener('click', _preventClicks);
					statsTab.style.display = ''; // default display
					statsTab.setAttribute('data-toggle', 'tab');
				} else {
					statsTab.classList.add('disabled');
					statsTab.addEventListener('click', _preventClicks);
					statsTab.style.display = 'none';
					statsTab.removeAttribute('data-toggle');
				}
			}
		}
	},
	created() {
		const statsTab = (document.querySelector('a[href="#statistics"]') as HTMLAnchorElement);
		statsTab.addEventListener('click', () => this.load(), { once: true });
	}
});

</script>
