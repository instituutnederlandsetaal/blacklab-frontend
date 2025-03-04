<template>
	<tr class="concordance rounded">
		<template v-for="col in cols.hitColumns">
			<td v-if="col.field === 'annotatedField'" class="doc-version" :key="col.key + col.field">
				<a @click.stop="" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank">{{ customHitInfo }}</a> <!-- todo tidy up custom fields. -->
			</td>
			<HitContext v-else-if="col.field === 'match' || col.field === 'after' || col.field === 'before' || col.field === 'annotation'" :key="col.key"
				tag=td
				:data="row.context"
				:bold="col.field === 'match'"
				:highlight="col.field !== 'annotation'"
				:before="col.field === 'before'"
				:after="col.field === 'after'"
				:punct="col.field !== 'annotation'"
				:annotation="col.annotation.id"
				:html="info.html"
				:dir="row.dir"
				:class="col.textAlignClass"

				:hoverMatchInfos="hoverMatchInfos"
				@hover="$emit('hover', $event)"
				@unhover="$emit('unhover')"
			/>
			<td v-else-if="col.field === 'metadata'" :key="col.key + col.metadata.id">{{ row.doc.docInfo[col.metadata.id]?.join(', ') || '' }}</td>

			<!-- TODO -->
			<td v-for="field in row.gloss_fields" :key="field.fieldName" style="overflow: visible;">
				<GlossField
					:fieldName="field.fieldName"
					:hit_first_word_id="row.hit_first_word_id"
					:hit_last_word_id="row.hit_last_word_id"
					:fieldDescription="field"
					:hitId="row.hit_id"
				/>
			</td>
		</template>


		<!-- <td v-if="customHitInfo" class='doc-version'><a @click.stop="" :href="data.href" title="Go to hit in document" target="_blank">{{ customHitInfo }}</a></td>
		<HitContext v-bind="commonProps" v-on="$listeners" class="text-right" :before="data.dir === 'ltr'" :after="data.dir === 'rtl'"/>
		<HitContext v-bind="commonProps" v-on="$listeners" class="text-center"/>
		<HitContext v-bind="commonProps" v-on="$listeners" class="text-left" :before="data.dir !== 'ltr'" :after="data.dir !== 'rtl'"/>
		<HitContext v-for="a in otherAnnotations" :key="a.id" v-bind="commonProps" v-on="$listeners" :annotation="a.id" :highlight="false" :punct="false"/>

		<td v-for="field in data.gloss_fields" :key="field.fieldName" style="overflow: visible;">
			<GlossField
				:fieldName="field.fieldName"
				:hit_first_word_id="data.hit_first_word_id"
				:hit_last_word_id="data.hit_last_word_id"
				:fieldDescription="field"
				:hitId="data.hit_id"
			/>
		</td>
		<td v-if="data.doc" v-for="meta in metadata" :key="meta.id">{{ data.doc.docInfo[meta.id]?.join(', ') || '' }}</td> -->
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';



import { corpusCustomizations } from '@/store/search/ui';

import HitContext from '@/pages/search/results/table/HitContext.vue';
import { ColumnDefs, DisplaySettingsForRendering, HitRowContext } from '@/utils/hit-highlighting';

import GlossField from '@/pages/search/form/concept/GlossField.vue';


// /**
//  * Can contain either a full hit or a partial hit (without capture/relations info)
//  * Partials hits are returned when requesting /docs.
//  */
// export type HitRows = {
// 	type: 'hit';
// 	doc: BLTypes.BLDoc;
// 	rows: HitRowData[];
// };

export default Vue.extend({
	components: {
		GlossField,
		HitContext
	},
	props: {
		// data: Object as () => HitRowData,
		// cols: Array as () => ColumnDefHit[],

		row: Object as () => HitRowContext,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,

		// info: Object as () => DisplaySettings,

		// mainAnnotation: Object as () => NormalizedAnnotation,
		// otherAnnotations: Array as () => NormalizedAnnotation[]|undefined,
		// metadata: Array as () => NormalizedMetadataField[]|undefined,
		// html: Boolean,
		/** Toggles whether we display the source annotated field of the hit. */
		// isParallel: Boolean,

		// which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
	},
	computed: {
		// commonProps(): any {
		// 	return {
		// 		data: this.data.context,
		// 		tag: 'td',
		// 		html: this.html,
		// 		dir: this.data.dir,
		// 		annotation: this.mainAnnotation.id,
		// 		hoverMatchInfos: this.hoverMatchInfos
		// 	};
		// },
		customHitInfo(): string|undefined {
			const versionPrefix = this.row.annotatedField && this.$tAnnotatedFieldDisplayName(this.row.annotatedField);
			return corpusCustomizations.results.customHitInfo(this.row.hit, versionPrefix)?.trim() || versionPrefix;
		},
	},
	methods: {
		hover(v: any) { this.$emit('hover', v); },
		unhover(v: any) { this.$emit('unhover', v); },
	}
});
</script>

<style lang="scss">

td.doc-version {
	padding-left: 1.5em!important;
}

</style>
