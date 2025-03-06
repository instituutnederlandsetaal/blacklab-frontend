<template>
	<tr class="concordance">
		<td colspan="10">
			<div class="well-light">
				<template v-if="concordances.results">
					<div class="concordance-controls clearfix">
						<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')"><span class="fa fa-angle-double-left"></span> {{$t('results.table.viewDetailedConcordances')}}</button>
						<button type="button" v-if="!concordances.done" :disabled="concordances.loading" class="btn btn-sm btn-default" @click="concordances.next()">
							<template v-if="concordances.loading"><Spinner :inline="true"/> {{$t('results.table.loading')}} HOI</template>
							<template v-else>{{$t('results.table.loadMoreConcordances')}}</template>
						</button>

						<button type="button" class="close close-concordances" :title="$t('results.table.close').toString()" @click="$emit('close')"><span>&times;</span></button>
					</div>

					<HitsTable v-if="type === 'hits' && concordances.results.rows.length"
						:rows="concordances.results"
						:info="{...info, detailedAnnotations: []}"
						:cols="cols"
					/>
					<DocsTable v-else-if="type === 'docs' && concordances.results.rows.length"
						:rows="concordances.results"
						:info="info"
						:cols="cols"
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
			</div>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import PaginatedGetter from '@/pages/search/results/table/ConcordanceGetter';
import {blacklab} from '@/api';
import { BLSearchParameters, BLHitResults, BLDocResults } from '@/types/blacklabtypes';

import HitsTable from '@/pages/search/results/table/HitsTable.vue';
import DocsTable from '@/pages/search/results/table/DocsTable.vue';

import { ColumnDefs, DisplaySettingsForRendering, GroupRowData, makeRows, Rows } from '@/pages/search/results/table/table-layout';

import Spinner from '@/components/Spinner.vue';
export default Vue.extend({
	components: {
		HitsTable, DocsTable, Spinner
	},
	props: {
		row: Object as () => GroupRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,

		open: Boolean,
		disabled: Boolean,
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,
	},
	data: () => ({
		concordances: null as any as PaginatedGetter<Rows>,
	}),
	created() {
		this.concordances = new PaginatedGetter((oldRows, first, number) => {
			// make a copy of the parameters so we don't clear them for all components using the summary
			const requestParameters: BLSearchParameters = Object.assign({}, this.query, {
				// Do not clear sample/samplenum/samplecount,
				// or we could retrieve concordances that weren't included in the input results for the grouping
				number,
				first,
				viewgroup: this.row.id,
				sort: undefined,
			} as BLSearchParameters);

			let {request, cancel} = this.type === 'hits' ? blacklab.getHits<BLHitResults>(INDEX_ID, requestParameters) : blacklab.getDocs<BLDocResults>(INDEX_ID, requestParameters);
			return {
				cancel,
				request: request
				.then(newResults => makeRows(newResults, this.info))
				.then(newRows => {
					newRows.rows = newRows.rows.filter(r => r.type === 'hit');

					if (!oldRows) return newRows;
					oldRows.rows.push(...newRows.rows);
					return oldRows;
				})
			}
		}, this.row.size)
	},
	watch: {
		open() {
			if (this.open && !this.concordances.done && !this.concordances.loading && !this.concordances.results?.rows.length) this.concordances.next();
		}
	}
});
</script>

<style lang="scss" scoped>
</style>