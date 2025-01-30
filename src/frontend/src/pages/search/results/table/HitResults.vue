<template>
	<div>

		<div class="crumbs-totals">
			<slot name="breadcrumbs"/>
			<slot name="totals"/>
		</div>

		<slot name="groupBy"/>
		<slot name="pagination"/>
		<slot name="annotation-switcher"/>

		<HitsTable
			:query="results.summary.searchParam"
			:mainAnnotation="mainAnnotation"
			:otherAnnotations="shownAnnotationCols"
			:detailedAnnotations="detailedAnnotations"
			:depTreeAnnotations="depTreeAnnotations"
			:metadata="shownMetadataCols"
			:sortableAnnotations="sortableAnnotations"
			:dir="textDirection"
			:html="concordanceAsHtml"
			:disabled="disabled"
			:data="rows"

			@changeSort="changeSort"
		/>

		<hr>

		<div class="bottom-layout">
			<slot name="pagination"/>
			<div class="spacer"></div>

			<slot name="sort"/>
			<button
				type="button"
				class="btn btn-primary btn-sm show-titles"

				@click="showTitles = !showTitles"
			>
				{{showTitles ? $t('results.table.hide') : $t('results.table.show')}} {{ $t('results.table.titles') }}
			</button>
			<slot name="export"/>
		</div>

		<!-- moved -->
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as CorpusStore from '@/store/search/corpus';
import * as GlossModule from '@/store/search/form/glossStore' // Jesse
import * as UIStore from '@/store/search/ui';
import { getDocumentUrl } from '@/utils';

import { BLDocFields, BLDocInfo, BLHit, BLHitInOtherField, BLHitResults, BLHitSnippet, BLMatchInfo, BLMatchInfoRelation, hitHasParallelInfo } from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';

import GlossField from '@/pages/search//form/concept/GlossField.vue' // Jesse

import {DocRowData} from './DocRow.vue';

import HitsTable, {HitRowData, HitRows} from './HitsTable.vue';
import { getHighlightColors, snippetParts } from '@/utils/hit-highlighting';

export default Vue.extend({
	components: {
	 	GlossField,
		HitsTable
	},
	props: {
		results: Object as () => BLHitResults,
		sort: String as () => string|null,
		disabled: Boolean
	},
	data: () => ({
		showTitles: true
	}),
	computed: {
		sourceField(): AppTypes.NormalizedAnnotatedField {
			return CorpusStore.get.allAnnotatedFieldsMap()[this.results.summary.pattern!.fieldName];
		},
		targetFields(): AppTypes.NormalizedAnnotatedField[] {
			return this.results.summary.pattern?.otherFields?.map(f => CorpusStore.get.allAnnotatedFieldsMap()[f]).filter(f => f) ?? [];
		},

		colors(): undefined|Record<string, AppTypes.TokenHighlight> {
			const colors = getHighlightColors(this.results.summary);
			return Object.keys(colors).length ? colors : undefined;
		},

		rows(): Array<DocRowData|HitRows> {
			const docFields = this.results.summary.docFields;
			const infos = this.results.docInfos;

			const highlightColors = this.colors;

			let prevPid: string;

			const mapBLHitToHitRowsArray = (hit: BLHit): Array<DocRowData|HitRows> => {
				const pid = hit.docPid;
				const docInfo: BLDocInfo = infos[pid];
				const doc = { docInfo, docPid: pid };

				// Render a row for this hit's document, if this hit occurred in a different document than the previous
				let docRow: DocRowData|undefined = undefined;
				if (pid !== prevPid) {
					prevPid = pid;
					if (this.showTitles) {
						docRow = {
							type: 'doc',
							summary: this.getDocumentSummary(docInfo, docFields),
							href: this.getDocumentUrl(pid, this.sourceField.id, undefined), // main document link doesn't open on the first hit.
							doc
						};
					}
				}

				this.transformSnippets?.(hit)

				// ids of the hit, if gloss module is enabled.
				const {startid, endid} = GlossModule.get.settings()?.get_hit_range_id(hit) ?? {startid: '', endid: ''};

				const rows: HitRowData[] = [
					// Create the row for the main hit. This is the hit in the source field.
					{
						hit,
						doc,
						context: snippetParts(hit, this.concordanceAnnotationId, this.textDirection, highlightColors),
						href: this.getDocumentUrl(pid, this.sourceField.id, hit.start), // link to the hit in the source field.
						annotatedField: this.sourceField, // this is the main hit. So it originated in the source field.
						isForeign: false,

						gloss_fields: GlossModule.get.gloss_fields(),
						hit_first_word_id: startid,
						hit_id: GlossModule.get.settings()?.get_hit_id(hit) ?? '',
						hit_last_word_id: endid
					}
				];

				// If this hit has parallel information, render a row for each target field
				if (hitHasParallelInfo(hit)) {
					// For every target field, create a row for the hit in that field.
					this.targetFields.forEach(field => {
						const hitForField = hit.otherFields[field.id];
						if (hitForField) {
							this.transformSnippets?.(hitForField);
							rows.push({
								hit: hitForField,
								doc,
								context: snippetParts(hitForField, this.concordanceAnnotationId, this.textDirection, highlightColors),
								href: this.getDocumentUrl(pid, field.id, hitForField.start), // link to the hit in the target field
								annotatedField: field, // this is the hit in the target field.
								isForeign: true,

								// Don't do glossing for hits in parallel target fields.
								gloss_fields: [],
								hit_first_word_id: '',
								hit_id: '',
								hit_last_word_id: ''
							});
						}
					});
				}

				const hitRow: HitRows = {
					type: 'hit',
					doc,
					rows
				};
				return docRow ? [docRow, hitRow] : [hitRow];
			};

			return this.results.hits.flatMap(mapBLHitToHitRowsArray);
		},
		/** Return all annotations shown in the main search form (provided they have a forward index) */
		sortableAnnotations(): AppTypes.NormalizedAnnotation[] { return UIStore.getState().results.shared.sortAnnotationIds.map(id => CorpusStore.get.allAnnotationsMap()[id]); },
		concordanceAnnotationId(): string { return UIStore.getState().results.shared.concordanceAnnotationId; },
		mainAnnotation(): AppTypes.NormalizedAnnotation { return CorpusStore.get.allAnnotationsMap()[this.concordanceAnnotationId]; },
		concordanceAsHtml(): boolean { return UIStore.getState().results.shared.concordanceAsHtml; },
		shownAnnotationCols(): AppTypes.NormalizedAnnotation[] {
			// Don't bother showing the value when we're sorting on the surrounding context and not the hit itself
			// as the table doesn't support showing data from something else than the hit
			const sortAnnotationMatch = this.sort && this.sort.match(/^-?hit:(.+)$/);
			const sortAnnotationId = sortAnnotationMatch ? sortAnnotationMatch[1] : undefined;

			const colsToShow = UIStore.getState().results.hits.shownAnnotationIds;
			return (sortAnnotationId && !colsToShow.includes(sortAnnotationId) ? colsToShow.concat(sortAnnotationId) : colsToShow)
			.map(id => CorpusStore.get.allAnnotationsMap()[id]);
		},
		shownMetadataCols(): AppTypes.NormalizedMetadataField[] {
			return UIStore.getState().results.hits.shownMetadataIds
			.map(id => CorpusStore.get.allMetadataFieldsMap()[id]);
		},
		/** Get annotations to show in concordances, if not configured, returns all annotations shown in the main search form. */
		detailedAnnotations(): AppTypes.NormalizedAnnotation[] {
			let configuredIds = UIStore.getState().results.shared.detailedAnnotationIds;
			if (!configuredIds?.length) {
				configuredIds = CorpusStore.get.annotationGroups().flatMap(g => g.isRemainderGroup ? [] : g.entries)
			}

			const annots = CorpusStore.get.allAnnotationsMap();
			const configuredAnnotations = configuredIds.map(id => annots[id]);
			// annotations need a forward index to be able to show values (blacklab can't provide them otherwise)
			return configuredAnnotations.filter(annot => annot.hasForwardIndex);
		},
		depTreeAnnotations(): Record<string, AppTypes.NormalizedAnnotation|null> {
			const allAnnots = CorpusStore.get.allAnnotationsMap();
			return Object.fromEntries(Object.entries(UIStore.getState().results.shared.dependencies).map(([key, id]) => [key, allAnnots[id!] || null]));
		},
		textDirection: CorpusStore.get.textDirection,

		transformSnippets(): null|((snippet: BLHitSnippet)=> void){ return UIStore.getState().results.shared.transformSnippets; },
		getDocumentSummary(): ((doc: BLDocInfo, fields: BLDocFields) => any) { return UIStore.getState().results.shared.getDocumentSummary },
	},
	methods: {
		changeSort(payload: string) {
			if (!this.disabled) {
				this.$emit('sort', payload === this.sort ? '-'+payload : payload);
			}
		},
		getDocumentUrl(pid: string, displayField: string, hitstart?: number) {
			return getDocumentUrl(
				pid,
				displayField,
				this.results.summary.pattern!.fieldName,
				this.results.summary.searchParam.patt,
				this.results.summary.searchParam.pattgapdata,
				hitstart
			)
		},
	},
});
</script>


<!-- gruwelijk, Jesse -->
<style lang="css">
.capture {
	border-style: solid;
	border-color: goldenrod;
}

.gloss_field_heading {
	font-style: italic
}
</style>
<style lang="scss" scoped>

.bottom-layout {
	display: flex;
	align-items: center;
	.spacer {
		flex-grow: 1;
	}
	.show-titles {
		margin: 0 0.5em;
	}
}

table {
	> thead > tr > th,
	> tbody > tr > td,
	> tbody > tr > th {
		&:first-child { padding-left: 6px; }
		&:last-child { padding-right: 6px; }
	}

	&.hits-table {
		border-collapse: separate;
		table-layout: auto;
		> tbody > tr {
			border-bottom: 1px solid #ffffff;

			> td {
				overflow: hidden;
				text-overflow: ellipsis;
			}

			&.concordance.open > td {
				overflow: visible;
			}
		}
	}

	&.concordance-details-table {
		table-layout: auto;
	}
}

</style>
