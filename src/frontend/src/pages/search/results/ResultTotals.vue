<template>
<div class="totals">
	<div class="totals-content">
		<Spinner v-if="(isCounting || !totals.isLoaded()) && !error" size="25" style="margin-right: 0.25em;"/>

		<div class="totals-text" :title="percentOfSearchSpaceClarification">
			<div class="totals-type">
				<div>{{ $t('results.resultsTotals.total') }} {{resultType}}<template v-if="!isFinished"> {{ $t('results.resultsTotals.soFar') }}</template>:</div>
				<div v-if="isGroups">{{ $t('results.resultsTotals.totalGroups') }}<template v-if="!isFinished"> {{ $t('results.resultsTotals.soFar') }}</template>:</div>
				<div>{{ $t('results.resultsTotals.searchTime') }}:</div>
				<!-- <div>Total pages<template v-if="!isFinished"> so far</template>:</div> -->
			</div>
			<div class="totals-count">
				<div>{{numPrefix}}{{numResults.toLocaleString()}}{{numSuffix}}</div>
				<div v-if="isGroups">{{numPrefix}}{{numGroups.toLocaleString()}}{{numSuffix}}</div>
				<div>{{searchTime}}</div>
				<!-- <div>{{numPrefix}}{{numPages.toLocaleString()}}{{numSuffix}}</div> -->
			</div>

			<span class="totals-percentage">
				<template v-if="searchSpaceCount > 0 /* might also be -1, in this case don't render -- see corpus store documentCount property */">
				({{frac2Percent(numResults / searchSpaceCount)}})
				</template>
			</span>
		</div>
	</div>

	<div v-if="error" class="totals-message text-danger" @click="totals.continueCounting" :title="error.message">
		<span class="fa fa-exclamation-triangle text-danger"/> {{ $t('results.resultsTotals.networkError') }}! <button type="button" class="totals-button" @click="totals.continueCounting"><span class="fa fa-rotate-right text-danger"></span> {{ $t('results.resultsTotals.retry') }}</button>
	</div>
	<div v-else-if="isLimited" class="totals-message text-danger" :title="`You may view up to ${numResultsRetrieved.toLocaleString()}. Additionally, BlackLab stopped counting after ${numResults.toLocaleString()}.`">
		<span class="fa fa-exclamation-triangle text-danger"/> <b>{{ $t('results.resultsTotals.queryLimited') }};</b> stopped after {{numResultsRetrieved.toLocaleString()}} from a total of more than {{numResults.toLocaleString()}}
	</div>
	<div v-else-if="isFinished && numResults > numResultsRetrieved" class="totals-message text-danger" :title="`You may only view up to ${numResultsRetrieved.toLocaleString()} results` ">
		<span class="fa fa-exclamation-triangle text-danger"/> <b>{{ $t('results.resultsTotals.queryLimited') }};</b> stopped after {{numResultsRetrieved.toLocaleString()}} from a total of {{numResults.toLocaleString()}}
	</div>
	<div v-else-if="isPaused" class="totals-message text-info">
		{{ $t('results.resultsTotals.heavyQuery') }} - search paused <button type="button" class="totals-button" @click="totals.continueCounting()"><span class="fa fa-rotate-right text-info"></span> {{ $t('results.resultsTotals.continue') }} </button>
	</div>
</div>
</template>


<script lang="ts">
import Vue from 'vue';

import * as Api from '@/api';
import * as BLTypes from '@/types/blacklabtypes';

import { TotalsLoader, TotalsOutput } from '@/pages/search/results/TotalsCounterStream';


import frac2Percent from '@/mixins/fractionalToPercent';

import Spinner from '@/components/Spinner.vue';
import { loadableFromObservable } from '@/utils/loadable-streams';

/**
 * Emits update events that contain the new set of totals, so we can update the pagination through our parent components
 * TODO tidy this!
 */

export default Vue.extend({
	components: {Spinner},
	props: {
		initialResults: {
			required: true,
			type: Object as () => BLTypes.BLSearchResult
		},
		type: {
			required: true,
			type: String as () => 'hits'|'docs',
		},
		indexId: {
			required: true,
			type: String as () => string,
		}
	},
	computed: {
		totals(): TotalsLoader { return new TotalsLoader({indexId: this.indexId, operation: this.type, results: this.initialResults }); },

		value(): TotalsOutput|undefined { return this.totals.isLoaded() ? this.totals.value : undefined; },
		error(): Api.ApiError|undefined { return this.totals.isError() ? this.totals.error : undefined; },
		isCounting(): boolean { return this.value?.state === 'counting'; },
		isLimited(): boolean { return this.value?.state === 'limited'; },
		isPaused(): boolean { return this.value?.state === 'paused'; },
		isFinished(): boolean { return this.value?.state === 'finished'; },

		resultType(): string { return this.type === 'hits' ? this.$t('results.resultsTotals.hits').toString() : this.$t('results.resultsTotals.documents').toString() },
		isGroups(): boolean { return this.value?.groups != null; },
		searchTime(): string { return this.value ? frac2Percent(this.value.searchTime / 100000, 1).replace('%', 's') : ''; },

		numPrefix(): string { return (this.isLimited || this.isPaused) ? '≥' : ''; },
		numSuffix(): string { return (this.isCounting || this.isPaused) ? '…' : ''; },
		numResults(): number { return this.type === 'hits' ? this.value?.hitsCounted ?? 0 : this.value?.docsCounted ?? 0; },
		numResultsRetrieved(): number { return this.type === 'hits' ? this.value?.hitsRetrieved ?? 0 : this.value?.docsRetrieved ?? 0; },
		numGroups(): number { return this.value?.groups ?? 0; },
		// numPages(): number { return Math.ceil((this.isGroups ? this.numGroups : this.numResultsRetrieved) / this.initialResults.summary.searchParam.number); },

		searchSpaceType(): string { return this.type === 'hits' ? this.$t('results.resultsTotals.tokens').toString() : this.$t('results.resultsTotals.documents').toString(); },
		/** The total number of relevant items in the searched subcorpus, tokens if viewing tokens, docs if viewing documents */
		searchSpaceCount(): number { return this.type === 'hits' ? this.value?.tokensInMatchingDocuments ?? 0 : this.value?.numberOfMatchingDocuments ?? 0 },
		percentOfSearchSpaceClarification(): string {
			// TODO i18n
			return `Matched ${this.numResults.toLocaleString()} ${this.resultType} in a total of ${this.isLimited ? ' more than' : ''} ${this.searchSpaceCount.toLocaleString()} ${this.searchSpaceType} in the searched subcorpus.`;
		}
	},
	methods: {
		frac2Percent,
	},
	watch: {
		totals: {
			handler(cur: TotalsLoader, prev: TotalsLoader) {
				if (cur !== prev) prev?.dispose();
			},
		}
	},
	destroyed() {
		this.totals.dispose();
	}
});
</script>

<style lang="scss">

.totals {
	color: #888;
	font-size: 85%;
}

.totals-content {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: flex-end;
}

.totals-text {
	white-space: nowrap;

	> .totals-type,
	> .totals-count,
	> .totals-percentage {
		display: inline-block;
		vertical-align: top;
	}

	.totals-count,
	.totals-percentage {
		font-family: monospace;
		text-align: right;
	}
}

.searchIndicator.totals-spinner {
	font-size: 16px;
	padding: 4px;
	margin: 0px 10px;
	z-index: 0;
}

.totals-message {
	> .fa {
		font-size: 14px;
		margin-right: 3px;
	}

	> .totals-button {
		background: none;
		border-color: inherit;
		outline: none;
		margin: 0;
		border-style: solid;
		border-width: 1px;
		border-radius: 100px;
		padding: 2px 4px;
	}
}

</style>
