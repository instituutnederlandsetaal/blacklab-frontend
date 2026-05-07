<template>
	<tr v-if="row.hits?.length" class="document-details">
		<td colspan="100" style="padding: 0.75em;">
			<GenericTable
				type="hits"
				:rows="{rows: row.hits}"
				:cols="cols"
				:info="info"
				:header="cols.hitColumns"
				
				:disableDetails="true"
			/>
			<div v-if="row.doc.numberOfHits && row.doc.numberOfHits > row.hits.length" class="text-muted clearfix col-xs-12 text-center"> ( {{row.doc.numberOfHits - row.hits.length}} {{ $t('results.table.moreHiddenHits') }}) </div>
		</td>
	</tr>
</template>

<script setup lang="ts">
import GenericTable from '@/pages/search/results/table/GenericTable.vue';
import { IRowDefaultProps, type IRowProps } from '@/pages/search/results/table/IRow';
import type { DocRowData } from '@/pages/search/results/table/table-layout';

defineOptions({ name: 'DocRowDetails' });
const props = withDefaults(defineProps<IRowProps<DocRowData>>(), IRowDefaultProps);

</script>

