<template>
	<div class="querysummary">
		{{ $t('results.querySummary.heading') }}<span class="small text-muted content" :title="summary">{{ summary.substr(0, 1000) }}</span>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import * as QueryStore from '@/features/search/model/query-state';

import { useI18n } from '@/shared/i18n';

const translate = useI18n();
const summary = computed(() => {
	const pattern = QueryStore.get.patternSummary();
	const filters = QueryStore.get.filterSummary();
	if (!pattern && !filters) return translate.$t('results.querySummary.allDocuments');

	let ret = '';
	if (pattern) ret += pattern + ' ' + translate.$t('results.querySummary.within') + ' ';
	if (filters) ret += translate.$t('results.querySummary.documentsWhere') + ' ' + filters;
	else ret += translate.$t('results.querySummary.allDocuments');
	return ret;
});
</script>

<style lang="scss">
.querysummary {
	background: white;
	font-size: 18px;
	padding: 8px 20px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;

	> .content {
		flex-grow: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-left: 0.35em;
	}
}
</style>
