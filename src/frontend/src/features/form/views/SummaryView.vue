<template>
	<section class="blf-summary-view">
		<div v-for="(entry, index) in summaries" :key="index">
			{{ entry.label }}<small v-if="entry.group"> ({{ entry.group }})</small>: <i>{{ entry.value }}</i>
		</div>
		<div class="sub-corpus-size">
			<template v-if="totals.status === 'error'"> {{ $t('filterOverview.error') }}: {{ totals.message }} </template>
			<template v-else-if="totals.status === 'loaded'">
				{{ $t('filterOverview.subCorpus') }}:<br />
				<span>
					{{ $t('filterOverview.totalDocuments') }}:<br />
					{{ $t('filterOverview.totalTokens') }}:
				</span>
				<span class="numbers">
					{{ totals.documents.toLocaleString() }}<br />
					{{ totals.tokens.toLocaleString() }}
				</span>
				<span class="numbers">
					({{ frac2Percent(totals.totalDocuments > 0 ? totals.documents / totals.totalDocuments : 0) }})<br />
					({{ frac2Percent(totals.totalTokens > 0 ? totals.tokens / totals.totalTokens : 0) }})
				</span>
			</template>
			<template v-else>
				<Spinner xs inline />
				{{ $t('filterOverview.calculating') }}
			</template>
		</div>
	</section>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, toValue, watch } from 'vue';

import { useFormSystemRuntime, useParentForm } from '../model/runtime';
import type { SummaryViewConfig } from '../model/views/summary-view';

import { frac2Percent } from '@/shared/utils/number-utils';

import Spinner from '@/shared/ui/Spinner.vue';

const props = defineProps<SummaryViewConfig>();
const parentForm = useParentForm();
const runtime = useFormSystemRuntime();
const compiled = computed(() => runtime.value.compileSummary(parentForm.value));
const summaries = computed(() => compiled.value.summaries.filter(entry => entry.summaryType.includes('filter')));
const totalsController = props.createTotals();
const totals = computed(() => toValue(totalsController.state));
const filter = computed(() => compiled.value.params.filter);
const searchfield = computed(() => compiled.value.params.searchfield);

watch([filter, searchfield], ([nextFilter, nextSearchfield]) => totalsController.update({ filter: nextFilter, searchfield: nextSearchfield }), { immediate: true });
if (totalsController.dispose) onScopeDispose(() => totalsController.dispose?.());
</script>

<style lang="scss" scoped>
.blf-summary-view {
	display: block;
	color: #888888;
	font-size: 85%;
	padding: 0 0 0 1px;
	margin-top: 20px;
	border: 0;
	background: transparent;
}

.sub-corpus-size {
	margin-top: 10px;
	margin-left: 10px;
}

span {
	display: inline-block;
	vertical-align: top;
}

.numbers {
	text-align: right;
	font-family: monospace;
}
</style>
