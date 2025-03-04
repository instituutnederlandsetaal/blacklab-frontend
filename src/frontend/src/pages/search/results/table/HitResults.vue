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
			:cols="cols"
			:rows="rows"
			:info="info"

			:disabled="disabled"
			@changeSort="changeSort"
		/>
			<!-- :query="results.summary.searchParam"
			:mainAnnotation="mainAnnotation"
			:otherAnnotations="shownAnnotationCols"
			:detailedAnnotations="detailedAnnotations"
			:depTreeAnnotations="depTreeAnnotations"
			:metadata="shownMetadataCols"
			:sortableAnnotations="sortableAnnotations"
			:dir="textDirection"
			:html="concordanceAsHtml"
			:disabled="disabled"
			:data="rows" -->

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

import HitsTable, {} from './HitsTable.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/utils/hit-highlighting';

export default Vue.extend({
	components: {
	 	// GlossField,
		HitsTable
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		sort: String as () => string|null,
		disabled: Boolean
	},
	data: () => ({
		showTitles: true
	}),
	computed: {
		// info(): DisplaySettings {
		// 	const ui = UIStore.getState();
		// 	const allAnnotations = CorpusStore.get.allAnnotationsMap();
		// 	return {
		// 		defaultGroupName: this.$t('results.groupBy.groupNameWithoutValue').toString(),
		// 		depTreeAnnotations: Object.fromEntries(Object.entries(ui.results.shared.dependencies).map(([key, id]) => [key, id && allAnnotations[id]])) as any,
		// 		detailedAnnotations: ui.results.shared.detailedAnnotationIds?.map(id => allAnnotations[id]) ?? [],
		// 		dir: CorpusStore.get.textDirection(),
		// 		getSummary: UIStore.getState().results.shared.getDocumentSummary,
		// 		html: ui.results.shared.concordanceAsHtml,
		// 		groupDisplayMode: 'table', // no groups here?
		// 		i18n: this,
		// 		mainAnnotation: allAnnotations[ui.results.shared.concordanceAnnotationId],
		// 		metadata: ui.results.hits.shownMetadataIds.map(id => CorpusStore.get.allMetadataFieldsMap()[id]),
		// 		otherAnnotations: ui.results.hits.shownAnnotationIds.map(id => allAnnotations[id]),
		// 		sortableAnnotations: ui.results.shared.sortAnnotationIds.map(id => allAnnotations[id]),
		// 		sourceField: this.results.summary.


		// 		// Object.fromEntries(Object.entries(UIStore.getState().results.shared.dependencies).map(([key, id]) => [key, allAnnots[id!] || null]));

		// 		// const allAnnots = CorpusStore.get.allAnnotationsMap();
		// 		// return
		// 	} ;
		// },
		// cols(): ColumnDefs {
		// 	return makeColumns(this.results, )
		// }

		// rows(): any[] {
		// 	return [];
		// },
		/** Return all annotations shown in the main search form (provided they have a forward index) */
		// sortableAnnotations(): AppTypes.NormalizedAnnotation[] { return UIStore.getState().results.shared.sortAnnotationIds.map(id => CorpusStore.get.allAnnotationsMap()[id]); },
		// mainAnnotation(): AppTypes.NormalizedAnnotation { return CorpusStore.get.allAnnotationsMap()[UIStore.getState().results.shared.concordanceAnnotationId]; },
		// concordanceAsHtml(): boolean { return UIStore.getState().results.shared.concordanceAsHtml; },
		// shownAnnotationCols(): AppTypes.NormalizedAnnotation[] {
		// 	// Don't bother showing the value when we're sorting on the surrounding context and not the hit itself
		// 	// as the table doesn't support showing data from something else than the hit
		// 	const sortAnnotationMatch = this.sort && this.sort.match(/^-?hit:(.+)$/);
		// 	const sortAnnotationId = sortAnnotationMatch ? sortAnnotationMatch[1] : undefined;

		// 	const colsToShow = UIStore.getState().results.hits.shownAnnotationIds;
		// 	return (sortAnnotationId && !colsToShow.includes(sortAnnotationId) ? colsToShow.concat(sortAnnotationId) : colsToShow)
		// 	.map(id => CorpusStore.get.allAnnotationsMap()[id]);
		// },
		// shownMetadataCols(): AppTypes.NormalizedMetadataField[] {
		// 	return UIStore.getState().results.hits.shownMetadataIds
		// 	.map(id => CorpusStore.get.allMetadataFieldsMap()[id]);
		// },
		// /** Get annotations to show in concordances, if not configured, returns all annotations shown in the main search form. */
		// detailedAnnotations(): AppTypes.NormalizedAnnotation[] {
		// 	let configuredIds = UIStore.getState().results.shared.detailedAnnotationIds;
		// 	if (!configuredIds?.length) {
		// 		configuredIds = CorpusStore.get.annotationGroups().flatMap(g => g.isRemainderGroup ? [] : g.entries)
		// 	}

		// 	const annots = CorpusStore.get.allAnnotationsMap();
		// 	const configuredAnnotations = configuredIds.map(id => annots[id]);
		// 	// annotations need a forward index to be able to show values (blacklab can't provide them otherwise)
		// 	return configuredAnnotations.filter(annot => annot.hasForwardIndex);
		// },
		// depTreeAnnotations(): Record<string, AppTypes.NormalizedAnnotation|null> {
		// 	const allAnnots = CorpusStore.get.allAnnotationsMap();
		// 	return Object.fromEntries(Object.entries(UIStore.getState().results.shared.dependencies).map(([key, id]) => [key, allAnnots[id!] || null]));
		// },
		// textDirection: CorpusStore.get.textDirection,

	},
	methods: {
		changeSort(payload: string) {
			if (!this.disabled) {
				this.$emit('sort', payload === this.sort ? '-'+payload : payload);
			}
		},
		// getDocumentUrl(pid: string, displayField: string, hitstart?: number) {
		// 	return getDocumentUrl(
		// 		pid,
		// 		displayField,
		// 		this.results.summary.pattern!.fieldName,
		// 		this.results.summary.searchParam.patt,
		// 		this.results.summary.searchParam.pattgapdata,
		// 		hitstart
		// 	)
		// },
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
