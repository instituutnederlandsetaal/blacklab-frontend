<template>
	<div class="legacy-filter-comparison-surface">
		<h3>Filter search by ...</h3>
		<FormSystem :definition="definition" :context="context" :initial-state="initialState" />
	</div>
</template>

<script setup lang="ts">
import { FormSystem, type FormRuntimeContext, type FormState, type FormSystemDefinition } from '../index';

defineProps<{
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
	initialState?: FormState;
}>();
</script>

<style lang="scss" scoped>
.legacy-filter-comparison-surface {
	max-width: 900px;
	margin: 0 auto;
	padding: 28px 30px 36px;
	background: #fff;
	color: #333;
}

h3 {
	font-size: 26px;
	font-weight: 700;
	line-height: 1.1;
	margin: 0 0 20px;
}

// .legacy-filter-comparison-surface :deep(.blf-form) {
// 	border: 0;
// 	border-radius: 0;
// 	background: transparent;
// 	padding: 0;
// 	gap: 0;
// 	box-shadow: none;
// }

.legacy-filter-comparison-surface :deep(.blf-form-title),
.legacy-filter-comparison-surface :deep(.blf-form-actions) {
	display: none;
}

.legacy-filter-comparison-surface :deep(.blf-form-body) {
	gap: 0;
}

.legacy-filter-comparison-surface :deep(.blf-tabs) {
	margin-bottom: 26px;
}

.legacy-filter-comparison-surface :deep(.blf-container-list) {
	gap: 18px;
}

.legacy-filter-comparison-surface :deep(.blf-field > label) {
	font-size: 0.95em;
	font-weight: 700;
}

.legacy-filter-comparison-surface :deep(.blf-help-text) {
	display: none;
}
</style>
