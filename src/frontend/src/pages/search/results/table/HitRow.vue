<template>
	<tr class="concordance" :class="{'foreign-hit': row.isForeign}">
		<template v-for="col in cols.hitColumns">
			<td v-if="col.field === 'custom'" :class="col.class" :style="col.style" :key="col.key + col.field">
				<a @click.stop="" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank">{{ row.customHitInfo }}</a>
			</td>
			<HitContext v-else-if="col.field === 'match' || col.field === 'after' || col.field === 'before' || col.field === 'annotation'" :key="col.key"
				tag=td
				:data="row.context"
				:bold="col.field === 'match'"
				:highlight="col.field !== 'annotation'"
				:before="col.field === 'before'"
				:after="col.field === 'after'"
				:annotation="col.annotation.id"
				:html="info.html"
				:dir="row.dir"
				:class="col.class"
				:style="col.style"

				:hoverMatchInfos="hoverMatchInfos"
				@hover="emit('hover', $event)"
				@unhover="emit('unhover')"
			/>
			<td v-else-if="col.field === 'metadata'" :key="col.key + col.metadata.id" :class="col.class" :style="col.style">{{ row.doc.docInfo[col.metadata.id]?.join(', ') || '' }}</td>
		</template>
	</tr>
</template>

<script setup lang="ts">

import HitContext from '@/pages/search/results/table/HitContext.vue';
import type { HitRowData } from '@/pages/search/results/table/table-layout';
import { type IRowProps, IRowDefaultProps } from '@/pages/search/results/table/IRow';

defineOptions({ name: 'HitRow' });
withDefaults(defineProps<IRowProps<HitRowData>>(), IRowDefaultProps);
const emit = defineEmits<{
	hover: [relationKeys: string[]],
	unhover: []
}>();
</script>

<style lang="scss" scoped>

.doc-version {
	padding-left: 1.5em!important;
}

</style>
