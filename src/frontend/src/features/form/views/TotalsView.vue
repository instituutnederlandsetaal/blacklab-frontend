<template>
	<section class="blf-totals-view">
		<!-- TODO i18n -->
		<header>{{ config.title || 'Subcorpus totals' }}</header>
		<div class="totals-grid">
			<span>Documents</span>
			<strong>{{ estimatedDocuments.toLocaleString() }}</strong>
			<span>Tokens</span>
			<strong>{{ estimatedTokens.toLocaleString() }}</strong>
		</div>
		<small>{{ filterActive ? 'Preview uses the current filter projection.' : 'No filters active.' }}</small>
	</section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { FormViewNode } from '@/features/form/model/types/form-shape';
import type { TotalsViewConfig } from '@/features/form/model/views/totals-view';

import { useParentForm } from '../model/runtime';

const {
	node: { config },
} = defineProps<{
	node: FormViewNode<TotalsViewConfig>;
}>();

const parentForm = useParentForm();
const filterProjection = computed(() => parentForm.compiled.filter);
const filterActive = computed(() => !!filterProjection.value);
// TODO wire up properly, will need some fancy injections or otherwise connected imports
// need a good abstraction for that so external components can use the functionality as well
// and the whole remains testable and maintainable without tight coupling to the form implementation
// Might use a composable to just provide it upfront, we can swap it out during dev, and test it in isolation as well.
const estimateFactor = computed(() => (filterActive.value ? 0.38 : 1));
const estimatedDocuments = computed(() => Math.max(0, Math.round(config.baseDocuments * estimateFactor.value)));
const estimatedTokens = computed(() => Math.max(0, Math.round(config.baseTokens * estimateFactor.value)));
</script>

<style lang="scss" scoped>
.blf-totals-view {
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

.totals-grid {
	display: grid;
	grid-template-columns: max-content max-content;
	gap: 4px 12px;
}

strong {
	font-family: monospace;
	text-align: right;
}

small {
	color: var(--blf-text-muted);
}
</style>
