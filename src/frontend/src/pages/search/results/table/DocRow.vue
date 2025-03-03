<template>
	<tr class="document rounded"
		v-tooltip.top-start="{
			content: `Document id: ${row.doc.docPid}`,
			trigger: 'hover',
			hideOnTargetClick: false,
			autoHide: false,
		}"
	>
		<td v-for="col in cols.docColumns" :key="col.key" :colspan="col.colspan">
			<a v-if="col.field === 'summary'" class="doctitle" target="_blank" :href="row.href">{{row.summary}}</a>
			<template v-else-if="col.field === 'metadata'">{{col.metadata && row.doc.docInfo[col.metadata.id]?.join(', ') || ''}}</template>
			<template v-else-if="col.field === 'hits'">{{row.doc.numberOfHits}}</template>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import { DocRowData, DisplaySettings, ColumnDefs } from '@/utils/hit-highlighting';


export default Vue.extend({
	props: {
		row: Object as () => DocRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettings,

		// data: Object as () => DocRowData,
		// /** Optional! */
		// metadata: Array as () => NormalizedMetadataField[]|undefined,
		// colspan: Number
	},
});
</script>

