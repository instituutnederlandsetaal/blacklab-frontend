<template>
	<tr class="concordance" :class="{'foreign-hit': row.isForeign}">
		<template v-for="col in cols.hitColumns">
			<td v-if="col.field === 'custom'" class="doc-version" :key="col.key + col.field">
				<a @click.stop="" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank">{{ row.customHitInfo }}</a>
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

import HitContext from '@/pages/search/results/table/HitContext.vue';
import { ColumnDefs, DisplaySettingsForRendering, HitRowData } from './table-layout';

import GlossField from '@/pages/search/form/concept/GlossField.vue';

export default Vue.component('HitRow', {
	components: {
		GlossField,
		HitContext
	},
	props: {
		row: Object as () => HitRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,
		open: Boolean,

		// which match infos (capture/relation) should be highlighted because we're hovering over a token? (parallel corpora)
		hoverMatchInfos: {
			type: Array as () => string[],
			default: () => [],
		},
	},
	methods: {
		hover(v: any) { this.$emit('hover', v); },
		unhover(v: any) { this.$emit('unhover', v); },
	}
});
</script>

<style lang="scss">

th:first-child {
	padding-left: 1.5em;
}

td.doc-version {
	padding-left: 1.5em!important;
}

</style>
