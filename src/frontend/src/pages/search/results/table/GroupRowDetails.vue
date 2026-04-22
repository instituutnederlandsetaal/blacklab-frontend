<template>
	<tr class="grouprow-details">
		<td colspan="10" class="well-light">
			<template v-if="concordances.results">
				<div class="concordance-controls clearfix">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')"><span class="fa fa-angle-double-left"></span> {{$t('results.table.viewDetailedConcordances')}}</button>
					<button type="button" v-if="!concordances.done" :disabled="concordances.loading" class="btn btn-sm btn-default" @click="concordances.next()">
						<template v-if="concordances.loading"><Spinner :inline="true"/> {{$t('results.table.loading')}} HOI</template>
						<template v-else>{{$t('results.table.loadMoreConcordances')}}</template>
					</button>

					<button type="button" class="close close-concordances" :title="$t('results.table.close').toString()" @click="$emit('close')"><span>&times;</span></button>
				</div>

				<GenericTable
					style="margin: 8px 0;"
					:rows="concordances.results"
					:header="type === 'hits' ? cols.hitColumns : cols.docColumns"
					:cols="cols"
					:info="{...info, detailedAnnotations: []}"
					:type="type"
				/>
				<div class="concordance-controls clearfix" v-if="concordances.results?.rows.length > 10">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')"><span class="fa fa-angle-double-left"></span> {{$t('results.table.viewDetailedConcordances')}}</button>
					<button type="button" v-if="!concordances.done" :disabled="concordances.loading" class="btn btn-sm btn-default" @click="concordances.next()">
						<template v-if="concordances.loading"><Spinner inline/> {{$t('results.table.loading')}} HOI</template>
						<template v-else>{{$t('results.table.loadMoreConcordances')}}</template>
					</button>
				</div>
			</template>
			<div v-if="concordances.error != null" class="text-danger" v-html="concordances.error"></div>
			<Spinner v-if="!concordances.results && concordances.loading" center/>

		</td>
	</tr>
</template>

<script setup lang="ts">

import { blacklab } from '@/api';
import Spinner from '@/components/Spinner.vue';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import PaginatedGetter from '@/pages/search/results/table/ConcordanceGetter';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';
import { IRowDefaultProps, type IRowProps } from '@/pages/search/results/table/IRow';
import type { GroupRowData, Rows } from '@/pages/search/results/table/table-layout';
import { makeRows } from '@/pages/search/results/table/table-layout';
import type { BLDocResults, BLHitResults, BLSearchParameters } from '@/types/blacklabtypes';
import { computed, watch } from 'vue';

defineOptions({ name: 'GroupRowDetails' });
const props = withDefaults(defineProps<IRowProps<GroupRowData>>(), IRowDefaultProps);

// NOTE: was initially created using a watcher on props.row only, 
// but that leaves the type as T|undefined, so computed it is
const concordances = computed(() => new PaginatedGetter<Rows>((oldRows, first, number) => {
	// make a copy of the parameters so we don't clear them for all components using the summary
	const requestParameters: BLSearchParameters = {
		...props.query,
		// Do not clear sample/samplenum/samplecount,
		// or we could retrieve concordances that weren't included in the input results for the grouping
		number,
		first,
		viewgroup: props.row.id,
		// if parallel corpus, show aligned hits first. (if not, we don't care about order)
		sort: CorpusStore.get.isParallelCorpus() ? 'alignments' : undefined, 
	}

	const indexId = CorpusStore.get.indexId()!;
	const r = props.type === 'hits' 
		? blacklab.getHits<BLHitResults>(indexId, requestParameters) 
		: blacklab.getDocs<BLDocResults>(indexId, requestParameters);
	
	return r
		.then(newResults => makeRows(newResults, props.info))
		.then(newRows => {
			if (props.type === 'hits') newRows.rows = newRows.rows.filter(r => r.type === 'hit');
			else newRows.rows = newRows.rows.filter(r => r.type === 'doc');

			if (!oldRows) return newRows;
			oldRows.rows.push(...newRows.rows);
			return oldRows;
		});
	}, props.row.size)
);

watch(() => props.open, (newVal) => {
	if (newVal && concordances.value && !concordances.value.done && !concordances.value.loading && !concordances.value.results?.rows.length) concordances.value.next();
});

</script>

<style lang="scss">

.well-light {
	background: rgba(255,255,255,0.8);
	border: 1px solid #e8e8e8;
	border-radius: 4px!important;
	box-shadow: inset 0 1px 2px 0px rgba(0,0,0,0.1);
	margin-bottom: 8px;
	padding: 8px!important;
}
</style>