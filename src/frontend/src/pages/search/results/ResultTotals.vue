<template>
	<div class="totals">
		<div class="totals-content">
			<Spinner v-if="(isCounting || !totals.isLoaded()) && !error" size="25" style="margin-right: 0.25em" />

			<div class="totals-text" :title="percentOfSearchSpaceClarification">
				<div class="totals-type">
					<div>
						{{ $t('results.resultsTotals.total') }} {{ resultType }}<template v-if="!isFinished"> {{ $t('results.resultsTotals.soFar') }}</template
						>:
					</div>
					<div v-if="isGroups">
						{{ $t('results.resultsTotals.totalGroups') }}<template v-if="!isFinished"> {{ $t('results.resultsTotals.soFar') }}</template
						>:
					</div>
					<div>{{ $t('results.resultsTotals.searchTime') }}:</div>
					<!-- <div>Total pages<template v-if="!isFinished"> so far</template>:</div> -->
				</div>
				<div class="totals-count">
					<div>{{ numPrefix }}{{ numResults.toLocaleString() }}{{ numSuffix }}</div>
					<div v-if="isGroups">{{ numPrefix }}{{ numGroups.toLocaleString() }}{{ numSuffix }}</div>
					<div>{{ searchTime }}</div>
					<!-- <div>{{numPrefix}}{{numPages.toLocaleString()}}{{numSuffix}}</div> -->
				</div>

				<span class="totals-percentage">
					<template v-if="searchSpaceCount > 0 /* might also be -1, in this case don't render -- see corpus store documentCount property */">
						({{ frac2Percent(numResults / searchSpaceCount) }})
					</template>
				</span>
			</div>
		</div>

		<button v-if="error" type="button" class="totals-message totals-button text-danger" @click="totals.continueCounting()" :title="error.message">
			<span class="fa fa-exclamation-triangle text-danger" /> {{ $t('results.resultsTotals.networkError') }}! <span class="fa fa-rotate-right text-danger"></span>
			{{ $t('results.resultsTotals.retry') }}
		</button>
		<div
			v-else-if="isLimited"
			class="totals-message text-danger"
			:title="`You may view up to ${numResultsRetrieved.toLocaleString()}. Additionally, BlackLab stopped counting after ${numResults.toLocaleString()}.`"
		>
			<span class="fa fa-exclamation-triangle text-danger" /> <b>{{ $t('results.resultsTotals.queryLimited') }};</b> stopped after {{ numResultsRetrieved.toLocaleString() }} from a total of more than
			{{ numResults.toLocaleString() }}
		</div>
		<div v-else-if="isFinished && numResults > numResultsRetrieved" class="totals-message text-danger" :title="`You may only view up to ${numResultsRetrieved.toLocaleString()} results`">
			<span class="fa fa-exclamation-triangle text-danger" /> <b>{{ $t('results.resultsTotals.queryLimited') }};</b> stopped after {{ numResultsRetrieved.toLocaleString() }} from a total of
			{{ numResults.toLocaleString() }}
		</div>
		<div v-else-if="isPaused" class="totals-message text-info">
			{{ $t('results.resultsTotals.heavyQuery') }} - search paused
			<button type="button" class="totals-button" @click="totals.continueCounting()"><span class="fa fa-rotate-right text-info"></span> {{ $t('results.resultsTotals.continue') }}</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';

import { createIterativeResultCountLoader } from '@/api/async/logic/result-count/result-count-from-query';
import type { TotalsOutput } from '@/api/async/logic/result-count/result-count-helpers';
import type { ExecutedSearchRequest } from '@/features/search/model/results/result-types';
import type * as BLTypes from '@/types/blacklabtypes';

import { useBlackLabApi } from '@/shared/api';
import type { ApiError } from '@/shared/api/lib/api-types';
import { useI18n } from '@/shared/i18n';
import { frac2Percent } from '@/shared/utils/number-utils';

import Spinner from '@/shared/ui/Spinner.vue';

const props = defineProps<{
	initialResults: BLTypes.BLSearchResult;
	executedRequest: ExecutedSearchRequest;
	indexId: string;
	annotatedFieldId: string;
}>();
const emit = defineEmits<{
	update: [results: BLTypes.BLSearchResult];
}>();

const blacklab = useBlackLabApi();
const { $t } = useI18n();
const totals = computed(() =>
	createIterativeResultCountLoader(
		{
			annotatedFieldId: props.annotatedFieldId,
			indexId: props.indexId,
			request: props.executedRequest,
			results: props.initialResults,
		},
		blacklab,
	),
);

const value = computed<TotalsOutput | undefined>(() => (totals.value.isLoaded() ? totals.value.value : undefined));
const error = computed<ApiError | undefined>(() => (totals.value.isError() ? totals.value.error : undefined));
const isCounting = computed(() => value.value?.state === 'counting');
const isLimited = computed(() => value.value?.state === 'limited');
const isPaused = computed(() => value.value?.state === 'paused');
const isFinished = computed(() => value.value?.state === 'finished');

const isHits = computed(() => props.executedRequest.operation !== 'docs');
const resultType = computed(() => (isHits.value ? $t('results.resultsTotals.hits').toString() : $t('results.resultsTotals.documents').toString()));
const isGroups = computed(() => value.value?.groups != null);
const searchTime = computed(() => (value.value ? frac2Percent(value.value.searchTime / 100000, 1).replace('%', 's') : ''));

const numPrefix = computed(() => (isLimited.value || isPaused.value ? '≥' : ''));
const numSuffix = computed(() => (isCounting.value || isPaused.value ? '…' : ''));
const numResults = computed(() => (isHits.value ? (value.value?.hitsCounted ?? 0) : (value.value?.docsCounted ?? 0)));
const numResultsRetrieved = computed(() => (isHits.value ? (value.value?.hitsRetrieved ?? 0) : (value.value?.docsRetrieved ?? 0)));
const numGroups = computed(() => value.value?.groups ?? 0);

const searchSpaceType = computed(() => (isHits.value ? $t('results.resultsTotals.tokens').toString() : $t('results.resultsTotals.documents').toString()));
const searchSpaceCount = computed(() => (isHits.value ? (value.value?.tokensInMatchingDocuments ?? 0) : (value.value?.numberOfMatchingDocuments ?? 0)));
const percentOfSearchSpaceClarification = computed(
	() =>
		`Matched ${numResults.value.toLocaleString()} ${resultType.value} in a total of ${isLimited.value ? ' more than' : ''} ${searchSpaceCount.value.toLocaleString()} ${searchSpaceType.value} in the searched subcorpus.`,
);

watch(totals, (_current, previous) => previous.dispose());
watch(value, current => {
	if (current && current.results !== props.initialResults) emit('update', current.results);
});

onUnmounted(() => totals.value.dispose());
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

.totals-message {
	> .fa {
		font-size: 14px;
		margin-right: 3px;
	}
}

.totals-button {
	background: none;
	border-color: inherit;
	outline: none;
	margin: 0;
	border-style: solid;
	border-width: 1px;
	border-radius: 100px;
	padding: 2px 4px;
}
</style>
