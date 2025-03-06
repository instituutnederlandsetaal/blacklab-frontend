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
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';



import { corpusCustomizations } from '@/store/search/ui';

import HitContext from '@/pages/search/results/table/HitContext.vue';
import { ColumnDefs, DisplaySettingsForRendering, HitRowContext } from './table-layout';

import GlossField from '@/pages/search/form/concept/GlossField.vue';

export default Vue.extend({
	components: {
		GlossField,
		HitContext
	},
	props: {
		row: Object as () => HitRowContext,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,

		// which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
	},
	computed: {
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
