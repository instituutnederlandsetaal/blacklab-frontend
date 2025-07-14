<template>
	<div class="filter-overview">
		<div v-for="filter in activeFilters" :key="filter.id">
			{{$tMetaDisplayName(filter)}}<small v-if="filter.groupId"> ({{filter.groupId}})</small>: <i>{{summaryMap[filter.id]}}</i>
		</div>
		<!-- <div v-for="filter in activeFilters" :key="filter.id + '_lucene'">{{filter.displayName}}: <i>{{filter.lucene}}</i></div> -->

		<div class="sub-corpus-size">
			<template v-if="subcorpus.isError()">
				{{$t('filterOverview.error')}}: {{subcorpus.error.message}}
			</template>
			<template v-else-if="subcorpus.isLoaded()">
				{{$t('filterOverview.subCorpus')}}:<br>
				<span style="display: inline-block; vertical-align:top;">
					{{$t('filterOverview.totalDocuments')}}:<br>
					{{$t('filterOverview.totalTokens')}}:
				</span>
				<span style="display: inline-block; vertical-align:top; text-align: right; font-family: monospace;">
					 {{matchingCount.documents.toLocaleString()}}<br>
					 {{matchingCount.tokens.toLocaleString()}}
				</span>
				<span style="display: inline-block; vertical-align:top; text-align: right; font-family: monospace;">
					 ({{ frac2Percent(matchingCount.documents / totalCorpusDocs) }})<br>
					 ({{ frac2Percent(matchingCount.tokens / totalCorpusTokens) }})
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
import * as PatternStore from '@/store/form/patterns';

import { selectedSubCorpus$ } from '@/store/search/streams';

import * as BLTypes from '@/types/blacklabtypes';
import {ApiError} from '@/api';

import frac2Percent from '@/mixins/fractionalToPercent';
import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import { SelectedSubcorpusLoader } from '@/pages/search/results/TotalsCounterStream';

import Spinner from '@/components/Spinner.vue';

export default Vue.extend({
	components: {Spinner},
	data: () => ({
		subcorpus: SelectedSubcorpusLoader
	}),
	computed: {
		indexAndFilter() {
			return {
				index: CorpusStore.getState()!,
				filter: FilterStore.get.luceneQuery(),
				annotatedFieldId: PatternStore.get.shared().source || CorpusStore.get.mainAnnotatedField()
			};
		},
		activeFilters: FilterStore.get.activeFilters,

		summaryMap(): Record<string, string> {
			const r: Record<string, string> = {};
			this.activeFilters.forEach(f => {
				const summary = getValueFunctions(f).luceneQuerySummary(f.id, f.metadata, f.value);
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
	watch: {
		indexAndFilter: {
			handler() { this.subcorpus.next(this.indexAndFilter) },
			immediate: true,
		}
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