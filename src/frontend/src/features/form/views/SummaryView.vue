<template>
	<section class="blf-summary-view">
		<header>{{ title || $t(`form.summary.heading`) }}</header>
		<div v-if="entries.length" class="entries">
			<div v-for="entry in entries" :key="entry.id" class="entry">
				<span class="label">{{ entry.label }}</span>
				<span class="value">{{ entry.value }}</span>
			</div>
		</div>
		<div v-else class="empty">{{ $t(`form.summary.empty`) }}</div>

		<dl v-if="showRaw" class="raw">
			<dt>CQL</dt>
			<dd>{{ projection.cql || $t(`form.summary.none`) }}</dd>
			<dt>Lucene</dt>
			<dd>{{ projection.filter || $t(`form.summary.none`) }}</dd>
		</dl>
	</section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useParentForm } from '../model/runtime';
import type { SummaryViewConfig } from '../model/views/summary-view';

defineProps<SummaryViewConfig>();
const parentForm = useParentForm();
const projection = computed(() => parentForm.compiled);
const entries = computed(() => parentForm.summaries);
</script>

<style lang="scss" scoped>
.blf-summary-view {
	display: grid;
	gap: 8px;
	border: 1px solid var(--blf-border);
	border-radius: 5px;
	background: #fff;
	padding: 10px;
}

header {
	font-weight: 700;
}

.entries {
	display: grid;
	gap: 5px;
}

.entry {
	display: grid;
	grid-template-columns: minmax(8rem, max-content) minmax(0, 1fr);
	gap: 8px;
}

.label {
	color: var(--blf-text-muted);
}

.value,
dd {
	word-break: break-word;
}

.empty {
	color: var(--blf-text-muted);
	font-style: italic;
}

.raw {
	display: grid;
	grid-template-columns: max-content minmax(0, 1fr);
	gap: 4px 8px;
	margin: 0;
	border-top: 1px solid var(--blf-border);
	padding-top: 8px;
}

dt,
dd {
	margin: 0;
}

dt {
	color: var(--blf-text-muted);
}
</style>
