<template>
	<table class="hits-table" :class="{ parallel: isParallel }">
		<thead>
			<tr class="rounded">
				<th v-if="isParallel">
					{{ $t('results.table.parallelVersion') }}
				</th>

				<th v-for="def in columns"
					:class="def.textAlignClass"
					:key="def.key"
				>
					<span v-if="def.sortOptions.length > 1" class="dropdown">
						<a role="button" data-toggle="dropdown" :class="['dropdown-toggle', {disabled}]">
							{{def.columnLabel}}
							<span class="caret"></span>
						</a>
						<ul class="dropdown-menu" role="menu">
							<li v-for="o in def.sortOptions" :key="o.sortKey" :class="{disabled}">
								<a :class="['sort', {disabled}]" role="button" @click="changeSort(o.sortKey)">{{o.label}} <Debug>{{o.debugLabel}}</Debug></a>
							</li>
						</ul>
					</span>
					<a v-else-if="def.sortOptions.length === 1"
						role="button"
						:class="['sort', {disabled}]"
						:title="def.sortOptions[0].title.toString()"
						@click="changeSort(def.sortOptions[0].sortKey)">{{ def.sortOptions[0].label }} <Debug>{{def.sortOptions[0].debugLabel}}</Debug>
					</a>
					<template v-else>{{def.columnLabel}}</template>
				</th>

				<!-- glosses todo -->
				<!-- <th v-for="(fieldName, i) in shownGlossCols" :key="i"><a class='sort gloss_field_heading' :title="`User gloss field: ${fieldName}`">{{ fieldName }}</a></th> -->
			</tr>
		</thead>
		<template v-for="(h, i) in data">
			<Hit v-if="h.type === 'hit'"
				:query="query"
				:mainAnnotation="mainAnnotation"
				:otherAnnotations="otherAnnotations"
				:detailedAnnotations="detailedAnnotations"
				:depTreeAnnotations="depTreeAnnotations"
				:metadata="metadata"
				:dir="dir"
				:html="html"
				:disabled="disabled"
				:disableDetails="disableDetails"
				:h="h"
				:isParallel="isParallel"
			/>
			<DocRow v-else :key="`${i}-doc`"
				:data="h"
				:metadata="metadata"
				:colspan="colspan"
			/>
		</template>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';
import { BLSearchParameters } from '@/types/blacklabtypes';

import Hit from '@/pages/search/results/table/Hit.vue';
import HitRow, {HitRows} from '@/pages/search/results/table/HitRow.vue'
import HitRowDetails from '@/pages/search/results/table/HitRowDetails.vue'
import DocRow, {DocRowData} from '@/pages/search/results/table/DocRow.vue';
import { TranslateResult } from 'vue-i18n';

export {HitRows, HitRowData} from '@/pages/search/results/table/HitRow.vue';

/**
 * TODO maybe move transformation of blacklab results -> hit row into this component?
 * Might be difficult as we can render this in three places which all have slightly different data.
 */
export default Vue.extend({
	components: {
		DocRow,
		Hit,
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
		depTreeAnnotations: Object as () => Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,
		/** Optional. Additional metadata columns to show. Normally nothing, but could show document id or something */
		metadata: Array as () => NormalizedMetadataField[]|undefined,
		/** Optional */
		sortableAnnotations: Array as () => NormalizedAnnotation[]|undefined,

		dir: String as () => 'ltr'|'rtl',
		/** Render contents as html or text */
		html: Boolean,
		/** Prevent interaction with sorting, expanding/collapsing, etc. */
		disabled: Boolean,
		disableDetails: Boolean,

		/** The results */
		data: Array as () => Array<HitRows|DocRowData>,
	},
	computed: {
		/**
		 * Column header definitions.
		 * The 3 main columns can have a dropdown to sort by various properties of the hit.
		 * Other columns will sort the main hit column.
		 * Order is
		 * [ parallelfieldname* , left, center, right, ...annotations, ...metadata]
		 */
		columns():  Array<{
			columnLabel: TranslateResult;
			textAlignClass: string;
			key: string;
			sortOptions: Array<{label: TranslateResult, title: TranslateResult, sortKey: string, debugLabel: string}>
		}> {
			const leftLabelKey = this.dir === 'rtl' ? 'results.table.columnLabelAfterHit' : 'results.table.columnLabelBeforeHit';
			const centerLabelKey = 'results.table.columnLabelHit';
			const rightLabelKey = this.dir === 'rtl' ? 'results.table.columnLabelBeforeHit' : 'results.table.columnLabelAfterHit';
			const blSortPrefixLeft = this.dir === 'rtl' ? 'after' : 'before'; // e.g. before:word or before:lemma
			const blSortPrefixCenter = 'hit'; // e.g. hit:word or hit:lemma
			const blSortPrefixRight = this.dir === 'rtl' ? 'before' : 'after'; //. e.g. after:word or after:lemma

			const contextAnnots = this.sortableAnnotations || [];
			const otherAnnots = this.otherAnnotations || [];
			const meta = this.metadata || [];

			const sortAnnot = (a: NormalizedAnnotation, prefix: string) => ({
				label: this.$tAnnotDisplayName(a),
				title: this.$t('results.table.sortBy', {field: this.$tAnnotDisplayName(a)}),
				sortKey: `${prefix}:${a.id}`,
				debugLabel: `(id: ${a.id})`
			})
			const sortMeta = (m: NormalizedMetadataField) => ({
				label: this.$tMetaDisplayName(m),
				title: this.$t('results.table.sortBy', {field: this.$tMetaDisplayName(m)}),
				sortKey: `field:${m.id}`,
				debugLabel: `(id: ${m.id})`
			})

			return [{
				key: 'left',
				columnLabel: this.$t(leftLabelKey),
				textAlignClass: 'text-right',
				sortOptions: contextAnnots.map(a => sortAnnot(a, blSortPrefixLeft))
			}, {
				key: 'hit',
				columnLabel: this.$t(centerLabelKey),
				textAlignClass: 'text-center',
				sortOptions: contextAnnots.map(a => sortAnnot(a, blSortPrefixCenter))
			}, {
				key: 'right',
				columnLabel: this.$t(rightLabelKey),
				textAlignClass: 'text-left',
				sortOptions: contextAnnots.map(a => sortAnnot(a, blSortPrefixRight))
			},
			...otherAnnots.map(a => ({
				key: `annot_${a.id}`,
				columnLabel: this.$tAnnotDisplayName(a),
				textAlignClass: this.dir === 'rtl' ? 'text-right' : 'text-left',
				sortOptions: [sortAnnot(a, blSortPrefixCenter)]
			})),
			...meta.map(m => ({
				key: `meta_${m.id}`,
				columnLabel: this.$tMetaDisplayName(m),
				textAlignClass: this.dir === 'rtl' ? 'text-right' : 'text-left',
				sortOptions: [sortMeta(m)]
			}))]
		},

		isParallel(): boolean {
			return this.data.find(d => d.type === 'hit' && d.rows.find(r => 'otherFields' in r.hit)) !== undefined;
		},
		colspan(): number {
			let c = this.columns.length
			// parallel results, show field name in extra column
			if (this.isParallel) { c += 1 }
			return c;
		}
	},
	methods: {
		changeSort(sort: string) {
			this.$emit('changeSort', sort)
		},
	},
})

</script>