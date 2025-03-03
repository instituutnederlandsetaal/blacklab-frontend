<template>
	<table class="docs-table">
		<thead>
			<tr class="rounded">
				<TableHeader v-for="col in cols.docColumns" :key="col.key" :col="col" @changeSort="changeSort" :disabled="disabled"/>
				<!-- glosses todo -->
				<!-- <th v-for="(fieldName, i) in shownGlossCols" :key="i"><a class='sort gloss_field_heading' :title="`User gloss field: ${fieldName}`">{{ fieldName }}</a></th> -->
			</tr>

			<!-- <tr class="rounded">
				<th><a role="button"
					@click="changeSort(`field:${specialFields.titleField}`)"
					:class="['sort', {'disabled': disabled}]"
					:title="$t('results.table.sortByDocument').toString()">
					{{ $t('results.table.document') }}
				</a></th>
				<th v-for="meta in metadata" :key="meta.id">
					<a role="button"
						@click="changeSort(`field:${meta.id}`)"
						:class="['sort', {'disabled': disabled}]"
						:title="$t('results.table.sortBy', {field: $tMetaDisplayName(meta)}).toString()"
					>
						{{$tMetaDisplayName(meta)}} <Debug>(id: {{meta.id}})</Debug>
					</a>
				</th>
				<th v-if="hasHits"><a role="button" @click="changeSort(`numhits`)" :class="['sort', {'disabled': disabled}]" :title="$t('results.table.sortByHits').toString()">{{ $t('results.table.hits') }}</a></th>
			</tr> -->
		</thead>
		<tbody>
			<template v-for="(row, index) in rows.rows">
				<DocRow v-if="row.type === 'doc'" :key="row.doc.docPid"
					:row="row"
					:cols="cols"
					:info="info"
				/>
				<!-- colspan will break here probably. -->

				<template v-if="showHits && row.type === 'hit'">
					<HitsTable
						:cols="cols.hitColumns"
						:rows="[row]"
						:info="info"

						:disabled="true"
						:disableDetails="true"
					/>
					<tr v-if="hiddenHits(row.rows[0])"><td :colspan="cols.docColumns.length + (cols.docColumns[0].colspan || 1)" class="text-muted col-xs-12 clearfix">
						...({{hiddenHits(row.rows[0])}} {{ $t('results.table.moreHiddenHits') }})
					</td></tr>
				</template>
			</template>


<!--
					<HitRow :key="rowData.doc.docPid + '_hits'"
					:new_data="rowData"
					:new_cols="new_cols.hitColumns"
					:html="info.html"
					:disabled="true"
					:disableDetails="true"
				>
				</HitRow>
				<tr v-if="hiddenHits(rowData)"><td :colspan="new_cols.docColumns.length + (new_cols.docColumns[0].colspan || 1)" class="text-muted col-xs-12 clearfix">
					...({{hiddenHits(rowData)}} {{ $t('results.table.moreHiddenHits') }})
				</td></tr>
			</template> -->

<!--
				<tr v-if="showHits && rowData.doc.snippets" :key="index + '-hits'">
					<td colspan="100">
						<HitsTable
							:data="hitRowsForDoc(rowData)"
							:mainAnnotation="mainAnnotation"
							:dir="dir"
							:html="html"
							:disabled="true"
							:disableDetails="true"
						/>
						<div class="text-muted clearfix col-xs-12" v-if="hiddenHits(rowData)">...({{hiddenHits(rowData)}} {{ $t('results.table.moreHiddenHits') }})</div>
					</td>
				</tr>
			</template> -->
		</tbody>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import HitsTable from '@/pages/search/results/table/HitsTable.vue';
import DocRow from '@/pages/search/results/table/DocRow.vue';
import TableHeader from '@/pages/search/results/table/TableHeader.vue';
import { ColumnDefs, DisplaySettings, HitRowContext, Rows } from '@/utils/hit-highlighting';


export default Vue.extend({
	components: {HitsTable, DocRow, TableHeader},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettings,

		// mainAnnotation: Object as () => NormalizedAnnotation,
		// metadata: Array as () => NormalizedMetadataField[]|undefined,
		// dir: String as () => 'ltr'|'rtl',
		// html: Boolean,
		disabled: Boolean,
		showHits: Boolean,

		// data: Array as () => DocRowData[]
	},
	computed: {
		// hasHits(): boolean { return this.data[0]?.doc.numberOfHits != null; },
		// specialFields(): BLDocFields { return CorpusStore.getState().corpus!.fieldInfo; },
	},
	methods: {
		changeSort(sort: string) {
			this.$emit('changeSort', sort)
		},
		// hitRowsForDoc(docRow: DocRowData): HitRows[] {
		// 	return docRow.doc.snippets!.map<HitRows>(s => ({
		// 		type: 'hit',
		// 		doc: docRow.doc,
		// 		rows: [{
		// 			hit: s,
		// 			annotatedField: undefined,
		// 			href: '',
		// 			isForeign: false,
		// 			// Don't pass color info here. We don't show capture highlights or releation info in doc snippets.
		// 			context: snippetParts(s, this.mainAnnotation.id, this.dir),
		// 			doc: docRow.doc,
		// 			gloss_fields: [],
		// 			hit_first_word_id: '',
		// 			hit_id: '',
		// 			hit_last_word_id: '',
		// 		}]
		// 	}));
		// },
		hiddenHits(docRow?: HitRowContext): number {
			return docRow ? (docRow.doc.numberOfHits || 0) - (docRow.doc.snippets?.length || 0) : 0;
		}
	}

})
</script>