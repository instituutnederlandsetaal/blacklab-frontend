<template>
	<div class="sub-corpus-size">
		<template v-if="subcorpus.isError()"> {{ $t('filterOverview.error') }}: {{ subcorpus.error.message }} </template>
		<template v-else-if="subcorpus.isLoaded()">
			{{ $t('filterOverview.subCorpus') }}:<br />
			<span style="display: inline-block; vertical-align: top">
				{{ $t('filterOverview.totalDocuments') }}:<br />
				{{ $t('filterOverview.totalTokens') }}:
			</span>
			<span style="display: inline-block; vertical-align: top; text-align: right; font-family: monospace">
				{{ subcorpus.value.numberOfMatchingDocuments.toLocaleString() }}<br />
				{{ subcorpus.value.tokensInMatchingDocuments.toLocaleString() }}
			</span>
			<span style="display: inline-block; vertical-align: top; text-align: right; font-family: monospace">
				({{ frac2Percent(subcorpus.value.numberOfMatchingDocuments / subcorpus.value.totalDocsInIndex) }})<br />
				({{ frac2Percent(subcorpus.value.tokensInMatchingDocuments / subcorpus.value.totalTokensInIndex) }})
			</span>
		</template>
		<template v-else>
			<Spinner xs inline />
			{{ $t('filterOverview.calculating') }}
		</template>
	</div>
</template>
<script setup lang="ts">
import type { FilteredResultCountLoaderOutput } from '@/features/totals/lib/result-count-from-filters';

import type { Loadable } from '@/shared/utils/loadable/loadable';
import { frac2Percent } from '@/shared/utils/numbers-utils';

defineProps<{
	subcorpus: Loadable<FilteredResultCountLoaderOutput>;
}>();
</script>
