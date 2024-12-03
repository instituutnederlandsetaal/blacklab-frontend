<template>
	<div class="filter-overview">
		<div v-for="filter in activeFilters" :key="filter.id">
			{{filter.defaultDisplayName}}<small v-if="filter.groupId"> ({{filter.groupId}})</small>: <i>{{summaryMap[filter.id]}}</i>
		</div>
		<!-- <div v-for="filter in activeFilters" :key="filter.id + '_lucene'">{{filter.displayName}}: <i>{{filter.lucene}}</i></div> -->

		<div class="sub-corpus-size">
			<template v-if="error">
				{{$t('filterOverview.error')}}: {{error.message}}
			</template>
			<template v-else-if="subCorpusStats">
				{{$t('filterOverview.subCorpus')}}:<br>
				<span style="display: inline-block; vertical-align:top;">
					{{$t('filterOverview.totalDocuments')}}:<br>
					{{$t('filterOverview.totalTokens')}}:
				</span>
				<span style="display: inline-block; vertical-align:top; text-align: right; font-family: monospace;">
					 {{subCorpusStats.summary.numberOfDocs.toLocaleString()}}<br>
					 {{subCorpusStats.summary.tokensInMatchingDocuments.toLocaleString()}}
				</span>
				<span style="display: inline-block; vertical-align:top; text-align: right; font-family: monospace;">
					 ({{ frac2Percent(subCorpusStats.summary.numberOfDocs / totalCorpusDocs) }})<br>
					 ({{ frac2Percent(subCorpusStats.summary.tokensInMatchingDocuments / totalCorpusTokens) }})
				</span>
			</template>
			<template v-else>
				<Spinner xs inline/>
				{{$t('filterOverview.calculating')}}
			</template>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import {Subscription} from 'rxjs';

import * as CorpusStore from '@/store/search/corpus';
import * as FilterStore from '@/store/search/form/filters';

import { selectedSubCorpus$ } from '@/store/search/streams';

import * as BLTypes from '@/types/blacklabtypes';
import {ApiError} from '@/api';

import frac2Percent from '@/mixins/fractionalToPercent';
import { valueFunctions } from '@/components/filters/filterValueFunctions';

import Spinner from '@/components/Spinner.vue';
import { RecursiveRequired } from '@/types/helpers';

export default Vue.extend({
	components: {Spinner},
	data: () => ({
		subscriptions: [] as Subscription[],
		subCorpusStats: null as null|RecursiveRequired<BLTypes.BLDocResults>,
		error: null as null|ApiError,
	}),
	computed: {
		activeFilters: FilterStore.get.activeFilters,
		summaryMap(): Record<string, string> {
			const r: Record<string, string> = {};
			this.activeFilters.forEach(f => {
				const summary = valueFunctions[f.componentName].luceneQuerySummary(f.id, f.metadata, f.value);
				if (summary) { r[f.id] = summary; }
			});
			return r;
		},

		totalCorpusTokens(): number { return CorpusStore.getState().corpus!.tokenCount; },
		totalCorpusDocs(): number { return CorpusStore.getState().corpus!.documentCount; }
	},
	methods: {
		frac2Percent
	},
	created() {
		this.subscriptions.push(selectedSubCorpus$.subscribe(v => {
			this.subCorpusStats = v.value || null;
			this.error = v.error || null;
		}));
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
	}
});
</script>

<style lang="scss" scoped>
.filter-overview {
	color: #888888;
	font-size: 85%;
	padding-left: 1px;
	margin-top: 20px;
}
.sub-corpus-size {
	margin-top: 10px;
	margin-left: 10px;
}
</style>