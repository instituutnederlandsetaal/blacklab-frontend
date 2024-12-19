<template>
<div class="totals">
	<div class="totals-content">
		<Spinner v-if="(isCounting || !subcorpus) && !error" size="25" style="margin-right: 0.25em;"/>

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

	<div v-if="error" class="totals-message text-danger" @click="continueCounting" :title="error.message">
		<span class="fa fa-exclamation-triangle text-danger"/> {{ $t('results.resultsTotals.networkError') }}! <button type="button" class="totals-button" @click="continueCounting"><span class="fa fa-rotate-right text-danger"></span> {{ $t('results.resultsTotals.retry') }}</button>
	</div>
	<div v-else-if="isLimited" class="totals-message text-danger" :title="`You may view up to ${numResultsRetrieved.toLocaleString()}. Additionally, BlackLab stopped counting after ${numResults.toLocaleString()}.`">
		<span class="fa fa-exclamation-triangle text-danger"/> <b>{{ $t('results.resultsTotals.queryLimited') }};</b> stopped after {{numResultsRetrieved.toLocaleString()}} from a total of more than {{numResults.toLocaleString()}}
	</div>
	<div v-else-if="isFinished && numResults > numResultsRetrieved" class="totals-message text-danger" :title="`You may only view up to ${numResultsRetrieved.toLocaleString()} results` ">
		<span class="fa fa-exclamation-triangle text-danger"/> <b>{{ $t('results.resultsTotals.queryLimited') }};</b> stopped after {{numResultsRetrieved.toLocaleString()}} from a total of {{numResults.toLocaleString()}}
	</div>
	<div v-else-if="isPaused" class="totals-message text-info">
		{{ $t('results.resultsTotals.heavyQuery') }} - search paused <button type="button" class="totals-button" @click="continueCounting"><span class="fa fa-rotate-right text-info"></span> {{ $t('results.resultsTotals.continue') }} </button>
	</div>
</div>
</template>


<script lang="ts">
import Vue from 'vue';

import {Subscription, ReplaySubject} from 'rxjs';

import * as Api from '@/api';

import { submittedSubcorpus$ as subcorpus$ } from '@/store/streams';
import yieldResultCounts, { CounterInput, CounterOutput } from '@/pages/search/results/TotalsCounterStream';

import * as BLTypes from '@/types/blacklabtypes';

import frac2Percent from '@/mixins/fractionalToPercent';

import Spinner from '@/components/Spinner.vue';

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
	data: () => ({
		subscriptions: [] as Subscription[],

		subcorpus: null as null|BLTypes.BLDocResults, // total searchSpace
		resultCount: {} as CounterOutput, // stream instantly returns output from the initials
		error: null as null|Api.ApiError,

		resultCount$: new ReplaySubject<CounterInput>(1),
	}),

	computed: {
		stats(): BLTypes.BLSearchResult { return this.resultCount.state !== 'error' ? this.resultCount.results : this.initialResults; },
		isCounting(): boolean { return !this.error && this.resultCount.state === 'counting'; },
		isLimited(): boolean { return !this.error && this.resultCount.state === 'limited'; },
		isPaused(): boolean { return !this.error && this.resultCount.state === 'paused'; },
		isFinished(): boolean { return this.isLimited || !(this.isCounting || this.isPaused); },

		resultType(): string { return BLTypes.isHitGroupsOrResults(this.stats) ? this.$t('results.resultsTotals.hits') as string : this.$t('results.resultsTotals.documents') as string; },
		isGroups(): boolean { return BLTypes.isGroups(this.stats); },
		searchTime(): string { return frac2Percent(this.stats.summary.searchTime / 100000, 1).replace('%', 's'); },

		numPrefix(): string { return (this.isLimited || this.isPaused) ? '≥' : ''; },
		numSuffix(): string { return (this.isCounting || this.isPaused) ? '…' : ''; },
		numResults(): number { return BLTypes.isHitGroupsOrResults(this.stats) ? this.stats.summary.numberOfHits : this.stats.summary.numberOfDocs; },
		numResultsRetrieved(): number { return BLTypes.isHitGroupsOrResults(this.stats) ? this.stats.summary.numberOfHitsRetrieved : this.stats.summary.numberOfDocsRetrieved; },
		numGroups(): number { return BLTypes.isGroups(this.stats) ? this.stats.summary.numberOfGroups : 0; },
		// numPages(): number { return Math.ceil((this.isGroups ? this.numGroups : this.numResultsRetrieved) / this.initialResults.summary.searchParam.number); },

		searchSpaceType(): string { return BLTypes.isHitGroupsOrResults(this.stats) ? this.$t('results.resultsTotals.tokens') as string : this.$t('results.resultsTotals.documents') as string; },
		/** The total number of relevant items in the searched subcorpus, tokens if viewing tokens, docs if viewing documents */
		searchSpaceCount(): number {
			if (this.subcorpus == null) {
				return -1;
			}

			return BLTypes.isHitGroupsOrResults(this.stats) ? this.subcorpus.summary.tokensInMatchingDocuments! : this.subcorpus.summary.numberOfDocs;
		},
		percentOfSearchSpaceClarification(): string {
			if (this.subcorpus == null) {
				return '';
			}

			return `Matched ${this.numResults.toLocaleString()} ${this.resultType} in a total of ${this.isLimited ? ' more than' : ''} ${this.searchSpaceCount.toLocaleString()} ${this.searchSpaceType} in the searched subcorpus.`;
		}
	},
	methods: {
		frac2Percent,
		continueCounting() {
			this.error = null;
			this.resultCount$.next({
				indexId: this.indexId,
				operation: this.type,
				results: this.stats
			});
		}
	},
	watch: {
		initialResults: {
			immediate: true,
			handler(v: BLTypes.BLSearchResult) {
				this.error = null;
				this.resultCount$.next({
					indexId: this.indexId,
					operation: this.type,
					results: v
				});
			}
		},

		// todo
		// not immediate on purpose so we don't emit the empty initial object
		resultCount(v: CounterOutput) {
			if (v.state !== 'error') {
				this.$emit('update', v.results);
			}
		}
	},
	created() {
		this.subscriptions.push(
			this.resultCount$
				.pipe(yieldResultCounts)
				.subscribe(v => {
					this.resultCount = v;
					if (v.state === 'error') {
						this.error = v.error;
					} else {
						this.error = null;
					}
				}),
			subcorpus$
				.subscribe(v => this.subcorpus = v)
		);
	},
	destroyed() {
		this.subscriptions.forEach(s => s.unsubscribe());
		this.resultCount$.complete();
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
