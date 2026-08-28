<template>
	<section :class="['blf-summary-view', totals ? 'filter-overview' : 'panel panel-default']">
		<template v-if="totals">
			<div v-for="(entry, index) in summaries" :key="index">
				{{ entry.label }}<small v-if="entry.group"> ({{ entry.group }})</small>: <i>{{ entry.value }}</i>
			</div>
			<TotalsView :totals />
		</template>
		<template v-else>
			<header class="panel-body">{{ resolvedTitle || $t(`form.summary.heading`) }}</header>
			<div v-if="summaries.length" class="entries panel-body">
				<div v-for="(entry, index) in summaries" :key="index" class="entry">
					<span class="label">{{ entry.label }}</span>
					<span class="value">{{ entry.value }}</span>
				</div>
			</div>
			<div v-else class="empty">{{ $t(`form.summary.empty`) }}</div>

			<dl v-if="showRaw" class="raw">
				<dt>CQL</dt>
				<dd>{{ compiled.params.patt || $t(`form.summary.none`) }}</dd>
				<dt>Lucene</dt>
				<dd>{{ compiled.params.filter || $t(`form.summary.none`) }}</dd>
			</dl>
		</template>
	</section>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, toValue, watch } from 'vue';

import { useFormSystemRuntime, useParentForm } from '../model/runtime';
import type { SummaryViewConfig } from '../model/views/summary-view';

import TotalsView from './TotalsView.vue';

const props = defineProps<SummaryViewConfig>();
const resolvedTitle = computed(() => (props.title ? toValue(props.title) : ''));
const parentForm = useParentForm();
const runtime = useFormSystemRuntime();
const compiled = computed(() => runtime.value.compileSummary(parentForm.value));
const summaryTypes = computed(() => (props.summaryType ? (Array.isArray(props.summaryType) ? props.summaryType : [props.summaryType]) : null));
const summaries = computed(() => (summaryTypes.value ? compiled.value.summaries.filter(entry => entry.summaryType?.some(type => summaryTypes.value?.includes(type))) : compiled.value.summaries));
const totalsController = props.createTotals?.();
const totals = totalsController ? computed(() => toValue(totalsController.state)) : null;

if (totalsController) {
	const filter = computed(() => compiled.value.params.filter);
	const searchfield = computed(() => compiled.value.params.searchfield);
	watch([filter, searchfield], ([nextFilter, nextSearchfield]) => totalsController.update({ filter: nextFilter, searchfield: nextSearchfield }), { immediate: true });
	if (totalsController.dispose) onScopeDispose(() => totalsController.dispose?.());
}
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

.filter-overview {
	display: block;
	color: #888888;
	font-size: 85%;
	padding: 0 0 0 1px;
	margin-top: 20px;
	border: 0;
	background: transparent;
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
