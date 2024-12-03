<template>
	<tr class="document rounded"
		v-tooltip.top-start="{
			content: `Document id: ${data.doc.docPid}`,
			trigger: 'hover',
			hideOnTargetClick: false,
		autoHide: false,
		}"
	>
		<td :colspan="colspan ? colspan - (metadata ? metadata.length : 0) - (data.doc.numberOfHits ? 1 : 0) : undefined" ><a class="doctitle" target="_blank" :href="data.href">{{data.summary}}</a></td>
		<td v-for="meta in metadata" :key="meta.id">{{data.doc.docInfo[meta.id]?.join(', ') || ''}}</td>
		<td v-if="data.doc.numberOfHits">{{data.doc.numberOfHits}}</td>
	</tr>
</template>

<script lang="ts">
import Vue from 'vue';

import { NormalizedMetadataField } from '@/types/apptypes';
import { BLDoc } from '@/types/blacklabtypes';

export type DocRowData = {
	type: 'doc';
	summary: string;
	href: string;
	doc: BLDoc,
};

export default Vue.extend({
	props: {
		data: Object as () => DocRowData,
		/** Optional! */
		metadata: Array as () => NormalizedMetadataField[]|undefined,
		colspan: Number as () => number|undefined,
	},

});
</script>

