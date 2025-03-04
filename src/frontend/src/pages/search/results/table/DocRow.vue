<template functional>
	<tr class="document rounded"
		v-tooltip.top-start="{
			content: `Document id: ${props.row.doc.docPid}`,
			trigger: 'hover',
			hideOnTargetClick: false,
			autoHide: false,
		}"
	>
		<td v-for="col in props.cols.docColumns" :key="col.key" :colspan="col.colspan">
			<a v-if="col.field === 'summary'" class="doctitle" target="_blank" :href="props.row.href">{{props.row.summary}}</a>
			<template v-else-if="col.field === 'metadata'">{{col.metadata && props.row.doc.docInfo[col.metadata.id]?.join(', ') || ''}}</template>
			<template v-else-if="col.field === 'hits'">{{props.row.doc.numberOfHits}}</template>
		</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import { DocRowData, DisplaySettingsForRendering, ColumnDefs } from '@/utils/hit-highlighting';


export default Vue.extend({
	functional: true,
	props: {
		row: Object as () => DocRowData,
		cols: Object as () => ColumnDefs,
		info: Object as () => DisplaySettingsForRendering,
	},
});
</script>

