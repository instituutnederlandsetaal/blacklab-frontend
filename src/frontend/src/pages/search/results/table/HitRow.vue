<template>
	<tbody :class="{interactable: !disableDetails && !disabled}">
		<!-- Show hits in other fields (parallel corpora) -->
		<template v-for="row in row.rows">
			<HitRowContext
				:class="{open, 'foreign-hit': row.isForeign}"
				:row="row"
				:cols="cols"
				:info="info"
				:html="info.html"
				:hoverMatchInfos="hoverMatchInfos"
				@hover="hoverMatchInfos = $event"
				@unhover="hoverMatchInfos = undefined"
				@click.native="open = disableDetails ? null : row.annotatedField.id"
			/>
			<HitRowDetails v-if="!disableDetails"
				:row="row"
				:cols="cols"
				:info="info"
				:colspan="cols.hitColumns.length"
				:open="open === row.annotatedField.id"
				:hoverMatchInfos="hoverMatchInfos"
				@hover="hoverMatchInfos = $event"
				@unhover="hoverMatchInfos = undefined"
			/>

			<!-- <HitRow :key="`${row.annotatedField?.id}-hit`"
				:class="{open, 'foreign-hit': row.isForeign}"
				:data="row"
				:mainAnnotation="mainAnnotation"
				:otherAnnotations="otherAnnotations"
				:metadata="metadata"
				:dir="dir"
				:html="html"
				:hoverMatchInfos="hoverMatchInfos"
				:isParallel="isParallel"
				@hover="hover($event)"
				@unhover="unhover()"
				@click.native="clickNative()"
			/>
			<HitRowDetails v-if="!disableDetails" :key="`${row.annotatedField?.id}-details`"
				:colspan="colspan"
				:data="row"
				:open="open"
				:mainAnnotation="mainAnnotation"
				:detailedAnnotations="detailedAnnotations"
				:depTreeAnnotations="depTreeAnnotations"
				:dir="dir"
				:html="html"
				:isParallel="isParallel"
				:hoverMatchInfos="hoverMatchInfos"
				@hover="hover($event)"
				@unhover="unhover()"
			/> -->
		</template>
	</tbody>
</template>

<script lang="ts">
import Vue from 'vue';
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue'
import HitRowContext from '@/pages/search/results/table/HitRowContext.vue'
import { ColumnDefHit, ColumnDefs, DisplaySettings, HitRowData } from '@/utils/hit-highlighting';

export default Vue.extend({
	components: {
		HitRowContext,
		HitRowDetails,
	},
	props: {
		row: Object as () => HitRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettings,


		// query: Object as () => BLSearchParameters|undefined,

		// /** Annotation shown in the before/hit/after columns and expanded concordance */
		// mainAnnotation: Object as () => NormalizedAnnotation,
		// /** Optional. Additional annotation columns to show (besides before/hit/after) */
		// otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// /** Optional. Annotations shown in the expanded concordance.  */
		// detailedAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// /** What properties/annotations to show for tokens in the deptree, e.g. lemma, pos, etc. */
		// depTreeAnnotations: Object as () =>  Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,

		// /** Optional. Additional metadata columns to show. Normally nothing, but could show document id or something */
		// metadata: Array as () => NormalizedMetadataField[]|undefined,

		// dir: String as () => 'ltr'|'rtl',
		/** Render contents as html or text */
		// html: Boolean,
		/** Prevent interaction with sorting, expanding/collapsing, etc. */
		disabled: Boolean,
		disableDetails: Boolean,

		// /** The results */
		// h: Object as () => HitRows,

		// /** Toggles whether we show the source field of the hits */
		// isParallel: Boolean,
	},
	data: () => ({
		open: null as string|null,
		hoverMatchInfos: undefined as undefined|string[],
	}),
	watch: {
		new_data() { this.open = null; }
	}
})

</script>

<style>

.parallel tbody tr:first-child td {
	padding-top: 0.5em;
}

.parallel tbody tr:last-child td {
	padding-bottom: 0.5em;
	border-bottom: 1px solid #ddd;
}

</style>