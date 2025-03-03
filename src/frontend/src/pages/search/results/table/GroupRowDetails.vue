<template>
	<tr class="concordance">
		<td colspan="10">
			<div class="well-light">
				<div class="concordance-controls clearfix">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')"><span class="fa fa-angle-double-left"></span> {{$t('results.table.viewDetailedConcordances')}}</button>
					<button type="button" v-if="!concordances.done" :disabled="concordances.loading" class="btn btn-sm btn-default" @click="concordances.next()">
						<Spinner v-if="concordances.loading">{{$t('results.table.loading')}}</Spinner>
						<template v-else>{{$t('results.table.loadMoreConcordances')}}</template>
					</button>

					<button type="button" class="close close-concordances" title="close" @click="$emit('close')"><span>&times;</span></button>
				</div>

				<div v-if="concordances.error != null" class="text-danger" v-html="concordances.error"></div>

				<HitsTable v-if="type === 'hits' && concordances.results?.rows.length"
					:data="concordances.results"
					:info="info"
					:cols="cols"
				/>
				<DocsTable v-else-if="type === 'docs' && concordances.results?.rows.length"
					:data="concordances.results"
					:info="info"
					:cols="cols"
				/>
				<div class="concordance-controls clearfix" v-if="concordances.results && concordances.results?.rows.length > 10">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')"><span class="fa fa-angle-double-left"></span> {{$t('results.table.viewDetailedConcordances')}}</button>
					<button type="button" v-if="!concordances.done" :disabled="concordances.loading" class="btn btn-sm btn-default" @click="concordances.next()">
						<template v-if="concordances.loading">
							<span class="fa fa-spin fa-spinner"></span> {{$t('results.table.loading')}}
						</template>
						<template v-else>{{$t('results.table.loadMoreConcordances')}}</template>
					</button>

					<button type="button" class="close close-concordances" :title="$t('results.table.close').toString()" @click="$emit('close')"><span>&times;</span></button>
				</div>

			</div>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import PaginatedGetter from '@/pages/search/results/table/ConcordanceGetter';
import {blacklab} from '@/api';
import { BLSearchParameters, BLHitResults, BLDocResults, isDocResults, isHitResults } from '@/types/blacklabtypes';

import HitsTable from '@/pages/search/results/table/HitsTable.vue'
import DocsTable from '@/pages/search/results/table/DocsTable.vue';

import { ColumnDefs, DisplaySettings, GroupRowData, makeRows, Rows } from '@/utils/hit-highlighting';

import Spinner from '@/components/Spinner.vue';
export default Vue.extend({
	components: {
		HitsTable, DocsTable, Spinner
	},
	props: {
		row: Object as () => GroupRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettings,

		open: Boolean,
		disabled: Boolean,
		type: String as () => 'hits'|'docs',
		query: Object as () => BLSearchParameters,


		// query: Object as () => BLSearchParameters,
		// /** Are we inside the docResults or hitResults. Not great. */
		// type: String as () => 'hits'|'docs',
		// data: Object as () => GroupRowData,

		// mainAnnotation: Object as () => NormalizedAnnotation,
		// otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// metadata: Array as () => NormalizedMetadataField[]|undefined,

		// dir: String as () => 'ltr'|'rtl',
		// html: Boolean,
		// disabled: Boolean,
		// open: Boolean
	},
	data: () => ({
		concordances: null as any as PaginatedGetter<Rows&{results: BLHitResults|BLDocResults}>,
	}),
	created() {
		this.concordances = new PaginatedGetter((r, first, number) => {
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
				request: request.then(newResults => {
					if (r) { // already have results - merge into new results.
						if (isDocResults(newResults) && isDocResults(r.results)) { r.results.docs.unshift(...newResults.docs); }
						else if (isHitResults(newResults) && isHitResults(r.results)) { r.results.hits.unshift(...newResults.hits); Object.assign(newResults.docInfos, r.results.docInfos); }
						else throw new Error('Unexpected results type');
					}
					return newResults;
				})
				.then<Rows&{results: BLHitResults|BLDocResults}>(r => ({
					...makeRows(r, this.info),
					results: r,
				}))
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