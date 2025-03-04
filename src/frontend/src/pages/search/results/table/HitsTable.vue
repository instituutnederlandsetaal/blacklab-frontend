<template>
	<table class="hits-table">
		<thead>
			<tr>
				<TableHeader v-for="col in cols.hitColumns" :key="col.key" :col="col" @changeSort="changeSort" :disabled="disabled" />
				<!-- glosses todo -->
				<!-- <th v-for="(fieldName, i) in shownGlossCols" :key="i"><a class='sort gloss_field_heading' :title="`User gloss field: ${fieldName}`">{{ fieldName }}</a></th> -->
			</tr>
		</thead>
		<template v-for="(row, i) in rows.rows">
			<HitRow v-if="row.type === 'hit'"
				:row="row"
				:cols="cols"
				:info="info"
				:disabled="disabled"
				:disableDetails="disableDetails"
			/>

			<DocRow v-else-if="row.type === 'doc'"
				:row="row"
				:cols="cols"
				:info="info"
			/>
		</template>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import HitRow from '@/pages/search/results/table/HitRow.vue'
import DocRow from '@/pages/search/results/table/DocRow.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/utils/hit-highlighting';

import TableHeader from './TableHeader.vue';

/**
 * TODO maybe move transformation of blacklab results -> hit row into this component?
 * Might be difficult as we can render this in three places which all have slightly different data.
 */
export default Vue.extend({
	components: {
		DocRow,
		HitRow,
		TableHeader,
	},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,

		// html: Boolean,
		disabled: Boolean,
		disableDetails: Boolean

		// query: Object as () => BLSearchParameters|undefined,
		// /** Annotation shown in the before/hit/after columns and expanded concordance */
		// mainAnnotation: Object as () => NormalizedAnnotation,
		// /** Optional. Additional annotation columns to show (besides before/hit/after) */
		// otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// /** Optional. Annotations shown in the expanded concordance.  */
		// detailedAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// /** What properties/annotations to show for tokens in the deptree, e.g. lemma, pos, etc. */
		// depTreeAnnotations: Object as () => Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,
		// /** Optional. Additional metadata columns to show. Normally nothing, but could show document id or something */
		// metadata: Array as () => NormalizedMetadataField[]|undefined,
		// /** Optional */
		// sortableAnnotations: Array as () => NormalizedAnnotation[]|undefined,

		// dir: String as () => 'ltr'|'rtl',
		// /** Render contents as html or text */
		// html: Boolean,
		// /** Prevent interaction with sorting, expanding/collapsing, etc. */
		// disabled: Boolean,
		// disableDetails: Boolean,

		// /** The results */
		// data: Array as () => Array<HitRowData|DocRowData>,
	},
	data: () => ({
		openRows: {} as Record<string, boolean>,
		hoverMatchInfos: null as null|{docPid: string, matchInfos: string[]}
	}),
	computed: {
		/**
		 * Column header definitions.
		 * The 3 main columns can have a dropdown to sort by various properties of the hit.
		 * Other columns will sort the main hit column.
		 * Order is
		 * [ parallelfieldname* , left, center, right, ...annotations, ...metadata]
		 */
		// columns():  Array<{
		// 	columnLabel: TranslateResult;
		// 	textAlignClass: string;
		// 	key: string;
		// 	sortOptions: Array<{label: TranslateResult, title: TranslateResult, sortKey: string, debugLabel: string}>
		// }> {
		// 	const leftLabelKey = this.dir === 'rtl' ? 'results.table.columnLabelAfterHit' : 'results.table.columnLabelBeforeHit';
		// 	const centerLabelKey = 'results.table.columnLabelHit';
		// 	const rightLabelKey = this.dir === 'rtl' ? 'results.table.columnLabelBeforeHit' : 'results.table.columnLabelAfterHit';
		// 	const blSortPrefixLeft = this.dir === 'rtl' ? 'after' : 'before'; // e.g. before:word or before:lemma
		// 	const blSortPrefixCenter = 'hit'; // e.g. hit:word or hit:lemma
		// 	const blSortPrefixRight = this.dir === 'rtl' ? 'before' : 'after'; //. e.g. after:word or after:lemma

		// 	const contextAnnots = this.sortableAnnotations || [];
		// 	const otherAnnots = this.otherAnnotations || [];
		// 	const meta = this.metadata || [];

		// 	const sortAnnot = (a: NormalizedAnnotation, prefix: string) => ({
		// 		label: this.$tAnnotDisplayName(a),
		// 		title: this.$t('results.table.sortBy', {field: this.$tAnnotDisplayName(a)}),
		// 		sortKey: `${prefix}:${a.id}`,
		// 		debugLabel: `(id: ${a.id})`
		// 	})
		// 	const sortMeta = (m: NormalizedMetadataField) => ({
		// 		label: this.$tMetaDisplayName(m),
		// 		title: this.$t('results.table.sortBy', {field: this.$tMetaDisplayName(m)}),
		// 		sortKey: `field:${m.id}`,
		// 		debugLabel: `(id: ${m.id})`
		// 	})

		// 	return [{
		// 		key: 'left',
		// 		columnLabel: this.$t(leftLabelKey),
		// 		textAlignClass: 'text-right',
		// 		sortOptions: contextAnnots.map(a => sortAnnot(a, blSortPrefixLeft))
		// 	}, {
		// 		key: 'hit',
		// 		columnLabel: this.$t(centerLabelKey),
		// 		textAlignClass: 'text-center',
		// 		sortOptions: contextAnnots.map(a => sortAnnot(a, blSortPrefixCenter))
		// 	}, {
		// 		key: 'right',
		// 		columnLabel: this.$t(rightLabelKey),
		// 		textAlignClass: 'text-left',
		// 		sortOptions: contextAnnots.map(a => sortAnnot(a, blSortPrefixRight))
		// 	},
		// 	...otherAnnots.map(a => ({
		// 		key: `annot_${a.id}`,
		// 		columnLabel: this.$tAnnotDisplayName(a),
		// 		textAlignClass: this.dir === 'rtl' ? 'text-right' : 'text-left',
		// 		sortOptions: [sortAnnot(a, blSortPrefixCenter)]
		// 	})),
		// 	...meta.map(m => ({
		// 		key: `meta_${m.id}`,
		// 		columnLabel: this.$tMetaDisplayName(m),
		// 		textAlignClass: this.dir === 'rtl' ? 'text-right' : 'text-left',
		// 		sortOptions: [sortMeta(m)]
		// 	}))]
		// },

		// isParallel(): boolean {
		// 	return this.data.find(d => d.type === 'hit' && d.rows.find(r => 'otherFields' in r.hit)) !== undefined;
		// },
		// colspan(): number {
		// 	let c = this.columns.length
		// 	// parallel results, show field name in extra column
		// 	if (this.isParallel) { c += 1 }
		// 	return c;
		// }
	},
	methods: {
		changeSort(sort: string) {
			this.$emit('changeSort', sort)
		},

		// hitDirection(hit: HitRows): 'ltr'|'rtl' {
		// 	// See if the document has overridden the text direction
		// 	const hd = hit.doc.docInfo['textDirection'];
		// 	if (hd && hd.length === 1) {
		// 		// Yes, use the document's text direction
		// 		return hd[0] === 'rtl' ? 'rtl' : 'ltr';
		// 	}
		// 	// No, use the corpus-wide default
		// 	return CorpusStore.get.textDirection();
		// }
	},
})

</script>