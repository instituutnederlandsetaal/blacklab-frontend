<template>
	<tr class="concordance">
		<td colspan="10">
			<div class="well-light">
				<div class="concordance-controls clearfix">
					<button type="button" class="btn btn-sm btn-primary open-concordances" :disabled="disabled" @click="$emit('openFullConcordances')"><span class="fa fa-angle-double-left"></span> {{$t('results.table.viewDetailedConcordances')}}</button>
					<button type="button" v-if="!concordances.done" :disabled="concordances.loading" class="btn btn-sm btn-default" @click="concordances.next()">
						<template v-if="concordances.loading">
							<span class="fa fa-spin fa-spinner"></span> {{$t('results.table.loading')}}
						</template>
						<template v-else>{{$t('results.table.loadMoreConcordances')}}</template>
					</button>

					<button type="button" class="close close-concordances" title="close" @click="$emit('close')"><span>&times;</span></button>
				</div>

				<div v-if="concordances.error != null" class="text-danger" v-html="concordances.error"></div>

				<HitsTable v-if="type === 'hits' && concordances.results.length"
					:data="concordances.results"
					:mainAnnotation="mainAnnotation"
					:dir="dir"
					:html="html"
				/>
				<DocsTable v-else-if="type === 'docs' && concordances.results.length"
					:mainAnnotation="mainAnnotation"
					:metadata="metadata"
					:dir="dir"
					:html="html"
					:data="concordances.results"
				/>
				<div class="concordance-controls clearfix" v-if="concordances.results.length > 10">
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

import frac2Percent from '@/mixins/fractionalToPercent';
import PaginatedGetter from '@/pages/search/results/table/ConcordanceGetter';
import {blacklab} from '@/api';
import { BLSearchParameters, BLHitResults, BLDocResults, BLHit, hitHasParallelInfo } from '@/types/blacklabtypes';

import HitsTable, {HitRowData, HitRows} from '@/pages/search/results/table/HitsTable.vue'
import DocsTable, {DocRowData} from '@/pages/search/results/table/DocsTable.vue';
import { NormalizedAnnotatedField, NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';
import { GroupRowData } from '@/pages/search/results/table/GroupTable.vue';

import * as UIStore from '@/store/search/ui';
import * as CorpusStore from '@/store/search/corpus';
import { getDocumentUrl } from '@/utils';
import { getHighlightColors, mergeMatchInfos, snippetParts } from '@/utils/hit-highlighting';


export default Vue.extend({
	components: {
		HitsTable, DocsTable
	},
	props: {
		query: Object as () => BLSearchParameters,
		/** Are we inside the docResults or hitResults. Not great. */
		type: String as () => 'hits'|'docs',
		data: Object as () => GroupRowData,

		mainAnnotation: Object as () => NormalizedAnnotation,
		otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		metadata: Array as () => NormalizedMetadataField[]|undefined,

		dir: String as () => 'ltr'|'rtl',
		html: Boolean,
		disabled: Boolean,
		open: Boolean
	},
	data: () => ({
		concordances: null as any as PaginatedGetter<HitRows|DocRowData>,
	}),
	computed: {
		concordanceAnnotationId(): string { return UIStore.getState().results.shared.concordanceAnnotationId; },
	},
	methods: {
		frac2Percent
	},
	created() {
		const getDocumentSummary = UIStore.getState().results.shared.getDocumentSummary;
		const fieldInfo = CorpusStore.getState().corpus!.fieldInfo;

		this.concordances = new PaginatedGetter<HitRows|DocRowData>((first, number) => {
			// make a copy of the parameters so we don't clear them for all components using the summary
			const requestParameters: BLSearchParameters = Object.assign({}, this.query, {
				// Do not clear sample/samplenum/samplecount,
				// or we could retrieve concordances that weren't included in the input results for the grouping
				number,
				first,
				viewgroup: this.data.id,
				sort: undefined,
			} as BLSearchParameters);

			if (this.type === 'hits') {
				let {request, cancel} = blacklab.getHits(INDEX_ID, requestParameters);
				return {
					cancel,
					request: request.then((r: BLHitResults) => {
						// For parallel corpora, make sure the target hits (otherFields)
						// 'know' they are the target of a relation.
						mergeMatchInfos(r);

						const colors = getHighlightColors(r.summary);

						const sourceField = CorpusStore.get.allAnnotatedFieldsMap()[r.summary.pattern!.fieldName] ?? '';
						const targetFields = r.summary.pattern?.otherFields?.map(f => CorpusStore.get.allAnnotatedFieldsMap()[f]).filter(f => f) ?? [];

						const convertBLHitToHitRows = (hit: BLHit): HitRows => {
							const pid = hit.docPid;
							const docInfo = r.docInfos[pid];
							const doc = { docInfo, docPid: pid };

							UIStore.getState().results.shared.transformSnippets?.(hit);

							// TODO?
							// // ids of the hit, if gloss module is enabled.
							// const {startid, endid} = GlossModule.get.settings()?.get_hit_range_id(hit) ?? {startid: '', endid: ''};

							const rows: HitRowData[] = [
								// Create the row for the main hit. This is the hit in the source field.
								{
									hit,
									doc,
									context: snippetParts(hit, this.concordanceAnnotationId, this.dir, colors),
									href: getDocumentUrl(pid, this.query.field ?? '', undefined, this.query.patt, this.query.pattgapdata, hit.start),
									annotatedField: sourceField,
									isForeign: false,

									gloss_fields: [],
									hit_first_word_id: '',
									hit_id: '',
									hit_last_word_id: '',
								}
							];

							// If this hit has parallel information, render a row for each target field
							if (hitHasParallelInfo(hit)) {
								// For every target field, create a row for the hit in that field.
								targetFields.forEach(field => {
									const hitForField = hit.otherFields[field.id];
									UIStore.getState().results.shared.transformSnippets?.(hit);
									rows.push({
										hit: hitForField,
										doc,
										context: snippetParts(hitForField, this.concordanceAnnotationId, this.dir, colors),
										href: getDocumentUrl(pid, field.id, undefined, this.query.patt, this.query.pattgapdata, hitForField.start), // link to the hit in the target field
										annotatedField: field, // this is the hit in the target field.
										isForeign: true,

										// Don't do glossing for hits in parallel target fields.
										gloss_fields: [],
										hit_first_word_id: '',
										hit_id: '',
										hit_last_word_id: ''
									});
								});
							}


							return  {
								type: 'hit',
								doc,
								rows
							};
						}

						return r.hits.map(convertBLHitToHitRows);
					})
				}
			} else {
				let {request, cancel} = blacklab.getDocs(INDEX_ID, requestParameters);
				return {
					cancel,
					request: request.then((r: BLDocResults) => r.docs.map<DocRowData>(doc => ({
						type: 'doc',
						doc,
						href: getDocumentUrl(
							doc.docPid,
							this.query.field ?? '',
							undefined,
							this.query.patt || undefined,
							this.query.pattgapdata || undefined),
						summary: getDocumentSummary(doc.docInfo, fieldInfo)
					})))
				}
			}
		}, this.data.size)
	},
	watch: {
		open() {
			if (this.open && !this.concordances.done && !this.concordances.loading && !this.concordances.results.length) this.concordances.next();
		}
	}
});
</script>

<style lang="scss" scoped>
</style>