<template>
	<tbody :class="{interactable: !disableDetails && !disabled}">
		<!-- Show hits in other fields (parallel corpora) -->
		<template v-for="row in h.rows">
			<HitRow
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
			<HitRowDetails v-if="!disableDetails"
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
			/>
		</template>
	</tbody>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';
import { BLSearchParameters } from '@/types/blacklabtypes';

import HitRow, {HitRows} from '@/pages/search/results/table/HitRow.vue'
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue'


/**
 * TODO maybe move transformation of blacklab results -> hit row into this component?
 * Might be difficult as we can render this in three places which all have slightly different data.
 */
export default Vue.extend({
	components: {
		HitRow,
		HitRowDetails,
	},
	props: {
		query: Object as () => BLSearchParameters|undefined,

		/** Annotation shown in the before/hit/after columns and expanded concordance */
		mainAnnotation: Object as () => NormalizedAnnotation,
		/** Optional. Additional annotation columns to show (besides before/hit/after) */
		otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		/** Optional. Annotations shown in the expanded concordance.  */
		detailedAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		/** What properties/annotations to show for tokens in the deptree, e.g. lemma, pos, etc. */
		depTreeAnnotations: Object as () =>  Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,

		/** Optional. Additional metadata columns to show. Normally nothing, but could show document id or something */
		metadata: Array as () => NormalizedMetadataField[]|undefined,

		dir: String as () => 'ltr'|'rtl',
		/** Render contents as html or text */
		html: Boolean,
		/** Prevent interaction with sorting, expanding/collapsing, etc. */
		disabled: Boolean,
		disableDetails: Boolean,

		/** The results */
		h: Object as () => HitRows,

		/** Toggles whether we show the source field of the hits */
		isParallel: Boolean,
	},
	data: () => ({
		open: false,
		hoverMatchInfos: [] as string[],
	}),
	computed: {
		colspan(): number {
			let c = 3; // hit, before, after
			if (this.isParallel) {
				c++; // parallel results, show field name in extra column
			}
			if (this.otherAnnotations) c += this.otherAnnotations.length;
			if (this.metadata) c += this.metadata.length;
			return c;
		},
	},
	methods: {
		clickNative() {
			if (!this.disableDetails) {
				this.open = !this.open;
			}
		},
		hover(matchInfos: string[]) {
			this.hoverMatchInfos = matchInfos;
		},
		unhover() {
			this.hoverMatchInfos = [];
		}
	},
	watch: {
		// Clear data when this component is reused
		h() { this.open = false; }
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