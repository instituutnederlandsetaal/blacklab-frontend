<template>
	<div class="querysummary">
		{{ $t('results.querySummary.heading') }}<span class="small text-muted content" :title="summary">{{ summary.substr(0, 1000) }}</span>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useSearchSummary } from '@/features/search/model/search-summary';

import { useI18n } from '@/shared/i18n';

const translate = useI18n();
const querySummary = useSearchSummary();
const summary = computed(() => {
	const { pattern, filter } = querySummary.value;
	return [
		pattern && `${pattern} ${translate.$t('results.querySummary.within')}`,
		filter ? `${translate.$t('results.querySummary.documentsWhere')} ${filter}` : translate.$t('results.querySummary.allDocuments'),
	]
		.filter(Boolean)
		.join(' ');
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
