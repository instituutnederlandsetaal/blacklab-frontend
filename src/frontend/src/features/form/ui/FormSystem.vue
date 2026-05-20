<template>
	<div class="blf-form-system">
		<NodeRenderer :node="definition.root" />
	</div>
</template>

<script setup lang="ts">
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { PersistableSubmittableFormState } from '@/features/form/model/types/form-query';
import type { FormState, FormSystemDefinition, FormSystemRuntime } from '@/features/form/model/types/form-state';

import { createFormSystemRuntime, provideFormSystemRuntime } from '../model/runtime';

import NodeRenderer from '@/features/form/ui/NodeRenderer.vue';

const props = defineProps<{
	definition: FormSystemDefinition;
	context: FormRuntimeContext;
	initialState?: FormState;
}>();

const emit = defineEmits<{
	ready: [runtime: FormSystemRuntime];
	submit: [formId: string, snapshot: PersistableSubmittableFormState];
}>();

const runtime = createFormSystemRuntime(props.definition, props.context, props.initialState);
provideFormSystemRuntime(runtime);
runtime.onSubmit((formId, snapshot) => emit('submit', formId, snapshot));
emit('ready', runtime);
</script>

<style lang="scss">
.blf-form-system {
	--blf-accent: #216ba5;
	--blf-accent-soft: #d9ebf7;
	--blf-border: #ccd5df;
	--blf-border-strong: #9fb0c0;
	--blf-panel: #f7f9fb;
	--blf-text-muted: #66717d;
	color: #1f2933;
	font-size: 14px;
}

.blf-form-system *,
.blf-form-system *::before,
.blf-form-system *::after {
	box-sizing: border-box;
}

.blf-form-system button,
.blf-form-system input,
.blf-form-system select,
.blf-form-system textarea {
	font: inherit;
}

.blf-input {
	display: block;
	width: 100%;
	min-height: 34px;
	border: 1px solid var(--blf-border);
	border-radius: 4px;
	background: #fff;
	padding: 6px 8px;
	color: inherit;
}

.blf-input:focus {
	border-color: var(--blf-accent);
	box-shadow: 0 0 0 2px rgba(33, 107, 165, 0.15);
	outline: none;
}

.blf-field,
.blf-filter-field {
	display: grid;
	gap: 6px;
	min-width: 0;
}

.blf-field > label,
.blf-filter-field > label,
.blf-filter-field legend {
	font-weight: 600;
	font-size: 0.95em;
	margin: 0;
}

.blf-filter-field fieldset {
	border: 0;
	margin: 0;
	padding: 0;
}

.blf-help-text,
.blf-muted {
	color: var(--blf-text-muted);
	font-size: 0.85em;
}

.blf-checkbox-inline,
.blf-choice label {
	display: inline-flex;
	gap: 6px;
	align-items: center;
	font-weight: 400;
}

.blf-filter-range {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.blf-segmented {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 0;
}

.blf-segmented button {
	border: 1px solid var(--blf-border);
	background: #fff;
	padding: 6px 10px;
	margin-left: -1px;
	cursor: pointer;
}

.blf-segmented button:first-child {
	border-radius: 4px 0 0 4px;
	margin-left: 0;
}

.blf-segmented button:last-child {
	border-radius: 0 4px 4px 0;
}

.blf-segmented button.active {
	background: var(--blf-accent);
	border-color: var(--blf-accent);
	color: #fff;
	z-index: 1;
}
</style>
