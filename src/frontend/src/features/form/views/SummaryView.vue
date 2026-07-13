<template>
	<section class="blf-summary-view panel panel-default">
		<header class="panel-body">{{ resolvedTitle || $t(`form.summary.heading`) }}</header>
		<div v-if="compiled.summaries.length" class="entries panel-body">
			<div v-for="entry in compiled.summaries" :key="entry.id" class="entry">
				<span class="label">{{ entry.label }}</span>
				<span class="value">{{ entry.value }}</span>
			</div>
		</div>
		<div v-else class="empty">{{ $t(`form.summary.empty`) }}</div>

		<dl v-if="showRaw" class="raw">
			<dt>CQL</dt>
			<dd>{{ compiled.patt || $t(`form.summary.none`) }}</dd>
			<dt>Lucene</dt>
			<dd>{{ compiled.filter || $t(`form.summary.none`) }}</dd>
		</dl>
	</section>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import { useFormSystemRuntime, useParentForm } from '../model/runtime';
import type { SummaryViewConfig } from '../model/views/summary-view';

const props = defineProps<SummaryViewConfig>();
const resolvedTitle = computed(() => (props.title ? toValue(props.title) : ''));
const parentForm = useParentForm();
const runtime = useFormSystemRuntime();
const compiled = computed(() => runtime.compile(parentForm.value));
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
