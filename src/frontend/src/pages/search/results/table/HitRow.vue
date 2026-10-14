<template>
	<tr class="concordance" :class="{ 'foreign-hit': row.isForeign }">
		<template v-for="col in cols.hitColumns">
			<td v-if="col.field === 'custom'" :class="col.class" :style="col.style" :key="col.key + col.field">
				<a v-if="showCustomHitInfoLink" @click.stop="" :href="row.href" :title="$t('results.table.goToHitInDocument').toString()" target="_blank">{{ row.customHitInfo }}</a>
				<span v-else>{{ row.customHitInfo }}</span>
			</td>
			<HitContext
				v-else-if="col.field === 'match' || col.field === 'after' || col.field === 'before' || col.field === 'annotation'"
				:key="col.key"
				tag="td"
				:data="row.context"
				:max-tokens="contextSize"
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
			<td v-else-if="col.field === 'metadata'" :key="col.key + col.metadata.id" :class="col.class" :style="col.style">
				{{ getMetadataFieldValues(row.doc.docInfo, col.metadata.id)?.join(', ') || '' }}
			</td>
		</template>
	</tr>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useCustomizations } from '@/customization-api/internal/internal-api';
import { useResultContextSize } from '@/features/search/model/results/result-context-size';
import type { IRowProps } from '@/pages/search/results/table/IRow';
import type { HitRowData } from '@/pages/search/results/table/table-layout';
import { getMetadataFieldValues } from '@/types/blacklabtypes';

import HitContext from '@/pages/search/results/table/HitContext.vue';

const contextSize = useResultContextSize();
const customizations = useCustomizations();

const props = defineProps<IRowProps<HitRowData>>();
const showCustomHitInfoLink = computed(() => !!props.row.href && customizations.hitInfoColumnLink());
const emit = defineEmits<{
	hover: [relationKeys: string[]];
	unhover: [];
}>();
</script>
