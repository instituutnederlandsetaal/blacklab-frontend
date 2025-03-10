<template>
	<tr v-if="row.hits?.length" class="document-details">
		<td colspan="100" style="opacity: 0.8; padding: 0.75em;">
			<GenericTable
				:rows="{rows: row.hits}"
				:cols="cols"
				:info="info"
				:header="cols.hitColumns"
				:disabled="true"
				:disableDetails="true"
			/>
			<div v-if="row.doc.numberOfHits > row.hits.length" class="text-muted clearfix col-xs-12 text-center"> ( {{row.doc.numberOfHits ?? 0 - row.hits.length}} {{ $t('results.table.moreHiddenHits') }}) </div>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import { DocRowData, DisplaySettingsForRendering, ColumnDefs } from '@/pages/search/results/table/table-layout';

export default Vue.component('DocRowDetails', {
	props: {
		row: Object as () => DocRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,
		open: Boolean
	},
});
</script>

