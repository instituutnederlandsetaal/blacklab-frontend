<template>
	<tr
		class="document"
		v-tooltip.top-start="{
			content: `Document id: ${row.doc.docPid}`,
			autoHide: false,
		}"
	>
		<td v-for="col in cols.docColumns" :key="col.key" :colspan="col.colspan" :class="col.class" :style="col.style">
			<a v-if="col.field === 'summary'" class="doctitle" target="_blank" :href="row.href">{{ row.summary }}</a>
			<template v-else-if="col.field === 'metadata'">{{ (col.metadata && row.doc.docInfo[col.metadata.id]?.join(', ')) || '' }}</template>
			<template v-else-if="col.field === 'hits'">{{ row.doc.numberOfHits }}</template>
		</td>
	</tr>
</template>

<script setup lang="ts">
import { IRowDefaultProps, type IRowProps } from '@/pages/search/results/table/IRow';
import type { DocRowData } from '@/pages/search/results/table/table-layout';

defineOptions({ name: 'DocRow' });
withDefaults(defineProps<IRowProps<DocRowData>>(), IRowDefaultProps);
</script>

<style lang="scss">
.doctitle {
	// Make line clickable when links wraps onto next line.
	display: inline-block;
}
</style>
