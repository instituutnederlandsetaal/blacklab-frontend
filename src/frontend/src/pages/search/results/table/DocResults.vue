<template>
	<div>
		<div class="crumbs-totals">
			<slot name="breadcrumbs"/>
			<slot name="totals"/>
		</div>

		<slot name="groupBy"/>
		<slot name="pagination"/>
		<slot name="annotation-switcher"/>

		<DocsTable
			:mainAnnotation="mainAnnotation"
			:metadata="metadata"
			:dir="dir"
			:html="html"
			:disabled="disabled"
			:showHits="showDocumentHits"
			:data="docRows"

			@changeSort="changeSort"
		/>

		<hr>
		<div class="text-right">
			<slot name="sort"/>
			<button v-if="hasHits"
				type="button"
				class="btn btn-primary btn-sm"

				@click="showDocumentHits = !showDocumentHits"
			>
				{{showDocumentHits ? $t('results.table.hideHits') : $t('results.table.showHits')}}
			</button>
			<slot name="export"/>
		</div>

	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';

import { getDocumentUrl } from '@/utils';
import { BLDocResults } from '@/types/blacklabtypes';
import { NormalizedMetadataField } from '@/types/apptypes';

import DocsTable, {DocRowData} from '@/pages/search/results/table/DocsTable.vue';

export default Vue.extend({
	components: {
		DocsTable,
	},
	props: {
		results: Object as () => BLDocResults,
		sort: String as () => null|string,
		disabled: Boolean
	},
	data: () => ({
		pinnedTooltip: null as null|number,
		showDocumentHits: false
	}),
	computed: {
		mainAnnotation(): CorpusStore.NormalizedAnnotation { return CorpusStore.get.allAnnotationsMap()[UIStore.getState().results.shared.concordanceAnnotationId]; },
		/** explicitly shown metadata fields + whatever field is currently being sorted on (if any). */
		metadata(): NormalizedMetadataField[]|undefined {
			const sortMetadataFieldMatch = this.sort && this.sort.match(/^-?field:(.+)$/);
			const sortMetadataField = sortMetadataFieldMatch ? sortMetadataFieldMatch[1] : undefined;

			const colsToShow = UIStore.getState().results.docs.shownMetadataIds;
			return (sortMetadataField && !colsToShow.includes(sortMetadataField) ? colsToShow.concat(sortMetadataField) : colsToShow)
			.map(id => CorpusStore.get.allMetadataFieldsMap()[id]);
		},
		dir(): 'ltr'|'rtl' { return CorpusStore.get.textDirection(); },
		html(): boolean { return UIStore.getState().results.shared.concordanceAsHtml; },
		docRows(): DocRowData[] {
			const getDocumentSummary = UIStore.getState().results.shared.getDocumentSummary;
			const specialFields = CorpusStore.getState().corpus!.fieldInfo;

			return this.results.docs.map(doc => {
				return {
					doc,
					href: getDocumentUrl(
						doc.docPid,
						this.results.summary.pattern?.fieldName ?? '',
						undefined,
						this.results.summary.searchParam.patt || undefined,
						this.results.summary.searchParam.pattgapdata || undefined),
					summary: getDocumentSummary(doc.docInfo, specialFields),
					type: 'doc'
				};
			});
		},
		hasHits(): boolean { return !!this.results.summary.searchParam.patt; } // if there's a cql pattern there are hits.
	},
	methods: {
		changeSort(payload: string) {
			if (!this.disabled) {
				this.$emit('sort', payload === this.sort ? '-'+payload : payload);
			}
		},
	},
	watch: {
		results: {
			handler() {
				this.pinnedTooltip = null;
			}
		}
	},
});
</script>

<style lang="scss">

.docs-table {
	table-layout: auto;

	> thead > tr > th,
	> tbody > tr > td,
	> tbody > tr > th {
		&:first-child { padding-left: 6px; }
		&:last-child { padding-right: 6px; }
	}


	tr.docrow:not(.hit-details):hover {
		background: #eee;
	}
}

.doclink {
	// Make line clickable when links wraps onto next line.
	display: inline-block;
}

</style>