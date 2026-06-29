<template>
	<div class="filter-overview">
		<div v-for="filter in activeFilters" :key="filter.id">
			{{ $tMetaDisplayName(filter) }}<small v-if="filter.groupId"> ({{ filter.groupId }})</small>: <i>{{ summaryMap[filter.id] }}</i>
		</div>
		<!-- <div v-for="filter in activeFilters" :key="filter.id + '_lucene'">{{filter.displayName}}: <i>{{filter.lucene}}</i></div> -->

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
	</div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';

import { selectedSubcorpusLoader as subcorpus } from '@/api/async/instances/result-count';
import { useCorpus } from '@/app/state/useCorpusContext';
import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';

import { frac2Percent } from '@/shared/utils/number-utils';

import Spinner from '@/shared/ui/Spinner.vue';

const corpus = useCorpus();

const activeFilters = computed(FilterStore.get.activeFilters);
const summaryMap = computed(() => {
	const r: Record<string, string> = {};
	activeFilters.value.forEach(f => {
		const summary = getValueFunctions(f).luceneQuerySummary(f.id, f.metadata, f.value);
		if (summary) {
			r[f.id] = summary;
		}
	});
	return r;
});

watchEffect(() =>
	subcorpus.next({
		index: corpus.value,
		filter: FilterStore.get.luceneQuery(),
		annotatedFieldId: PatternStore.get.shared().source || corpus.value.mainAnnotatedField,
	}),
);
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
