<template>
	<tr v-if="row.hits?.length" class="document-details">
		<td colspan="100" style="padding: 0.75em">
			<GenericTable type="hits" :rows="{ rows: row.hits }" :cols="cols" :info="info" :header="cols.hitColumns" :disableDetails="true" />
			<div v-if="row.doc.numberOfHits && row.doc.numberOfHits > row.hits.length" class="text-muted clearfix col-xs-12 text-center">
				({{ $t('results.table.moreHiddenHits', { count: row.doc.numberOfHits - row.hits.length }) }})
			</div>
		</td>
	</tr>
</template>

<script setup lang="ts">
import { IRowDefaultProps, type IRowProps } from '@/pages/search/results/table/IRow';
import type { DocRowData } from '@/pages/search/results/table/table-layout';

import GenericTable from '@/pages/search/results/table/GenericTable.vue';

defineOptions({ name: 'DocRowDetails' });
const props = withDefaults(defineProps<IRowProps<DocRowData>>(), IRowDefaultProps);
</script>
