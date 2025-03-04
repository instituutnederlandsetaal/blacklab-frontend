<template>
	<table class="docs-table">
		<thead>
			<tr>
				<TableHeader v-for="col in cols.docColumns" :key="col.key" :col="col" @changeSort="changeSort" :disabled="disabled"/>
			</tr>
		</thead>
		<tbody>
			<template v-for="(row, index) in rows.rows">
				<template v-if="row.type === 'doc'">
					<DocRow :key="row.doc.docPid" :class="{open: showHits && row.hits?.length}" class="concordance"
						:row="row"
						:cols="cols"
						:info="info"
					/>
					<tr v-if="showHits && row.hits && row.doc.numberOfHits" :key="index + '-hits'" class="concordance-details">
						<td colspan="100" style="opacity: 0.8; padding: 0.75em;">
							<HitsTable
								:rows="{rows: row.hits}"
								:cols="cols"
								:info="info"
								:disabled="true"
								:disableDetails="true"
							/>
							<div v-if="(row.doc.numberOfHits - row.hits.length ) > 0" class="text-muted clearfix col-xs-12 text-center"> ( {{row.doc.numberOfHits - row.hits.length}} {{ $t('results.table.moreHiddenHits') }}) </div>
						</td>
					</tr>
				</template>
			</template>
		</tbody>
	</table>
</template>

<script lang="ts">
import Vue from 'vue';

import HitsTable from '@/pages/search/results/table/HitsTable.vue';
import DocRow from '@/pages/search/results/table/DocRow.vue';
import TableHeader from '@/pages/search/results/table/TableHeader.vue';
import { ColumnDefs, DisplaySettingsForRendering, Rows } from '@/utils/hit-highlighting';
import { BLDoc } from '@/types/blacklabtypes';

export default Vue.extend({
	components: {HitsTable, DocRow, TableHeader},
	props: {
		cols: Object as () => ColumnDefs,
		rows: Object as () => Rows,
		info: Object as () => DisplaySettingsForRendering,
		disabled: Boolean,
		showHits: Boolean,
	},
	methods: {
		changeSort(sort: string) {
			this.$emit('changeSort', sort)
		},
		hiddenHits(doc: BLDoc): number {
			return (doc.numberOfHits || 0) - (doc.snippets?.length || 0);
		}
	}

})
</script>