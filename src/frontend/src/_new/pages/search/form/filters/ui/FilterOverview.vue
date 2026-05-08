<template>
	<div class="filter-overview">
		<div v-for="filter in summary" :key="filter.id">
			{{ filter.displayName }}<small v-if="filter.group"> ({{ filter.group }})</small>: <i>{{ filter.summary }}</i>
		</div>
		<!-- <div v-for="filter in activeFilters" :key="filter.id + '_lucene'">{{filter.displayName}}: <i>{{filter.lucene}}</i></div> -->

		<SubcorpusTotals :subcorpus="subcorpus" />
	</div>
</template>

<script setup lang="ts">
// import * as CorpusStore from '@/features/corpus/model/corpus-state';
// import * as FilterStore from '@/features/search/model/form/filter-state';
// import * as PatternStore from '@/features/search/model/form/pattern-state';

import { computed } from 'vue';

import { useBlackLabApi } from '@/_new/app/plugins/installApi';
import { FilteredResultCountLoader } from '@/_new/features/totals/lib/result-count-from-filters';

import SubcorpusTotals from '@/_new/features/totals/ui/SubcorpusTotals.vue';
// import { useCurrentCorpus } from '@/_new/app/plugins/installCorpusData';
// import { frac2Percent } from '@/_new/utils/numbers-utils';
// import { useI18n } from '@/_new/shared/i18n/i18n';

type FilterSummaryEntry = {
	id: string;
	summary: string;
	displayName: string;
	group: string;
};

// const translate = useI18n();
const blacklab = useBlackLabApi();
const subcorpus = new FilteredResultCountLoader(blacklab);
// const corpus = useCurrentCorpus();
const summary = computed<FilterSummaryEntry[]>(
	() => [],
	// FilterStore.get
	// .activeFilters()
	// .map<FilterSummaryEntry>(f => ({
	// 	id: f.id,
	// 	summary: getValueFunctions(f).luceneQuerySummary(f.id, f.metadata, f.value) || '',
	// 	displayName: translate.$tMetaDisplayName(f),
	// 	group: f.groupId || ''
	// }))
);

// start the request.
// watchEffect(() => subcorpus.next({
// 	annotatedFieldId: PatternStore.get.shared().source || CorpusStore.get.mainAnnotatedField(),
// 	index: corpus,
// 	filter: FilterStore.get.luceneQuery()
// }));
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
