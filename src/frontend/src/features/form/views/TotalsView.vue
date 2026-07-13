<template>
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
				({{ percentage(totals.documents, totals.totalDocuments) }})<br />
				({{ percentage(totals.tokens, totals.totalTokens) }})
			</span>
		</template>
		<template v-else>
			<Spinner xs inline />
			{{ $t('filterOverview.calculating') }}
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import type { TotalsViewConfig } from '../model/views/totals-view';

import { frac2Percent } from '@/shared/utils/number-utils';

import Spinner from '@/shared/ui/Spinner.vue';

const props = defineProps<TotalsViewConfig>();
const totals = computed(() => toValue(props.totals));

function percentage(value: number, total: number): string {
	return frac2Percent(total > 0 ? value / total : 0);
}
</script>

<style lang="scss" scoped>
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
