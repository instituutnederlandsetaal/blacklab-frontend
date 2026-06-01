<template>
	<div class="blf-form-system">
		<Component :is="resolveNodeComponent(definition.root)" v-bind="rootProps()" />
	</div>
</template>

<script setup lang="ts">
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { PersistableSubmittableFormState } from '@/features/form/model/types/form-query';
import type { FormState, FormSystemDefinition, FormSystemRuntime } from '@/features/form/model/types/form-state';

import { createFormSystemRuntime, provideFormSystemRuntime } from '../model/runtime';
import useUid from '@/shared/utils/useUid';
import { getNodeProps, resolveNodeComponent } from '@/features/form/ui/node-render';

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
const renderScopeId = useUid();
provideFormSystemRuntime(runtime);
runtime.onSubmit((formId, snapshot) => emit('submit', formId, snapshot));
emit('ready', runtime);

function rootProps() {
	return getNodeProps(props.definition.root, {
		runtime,
		scopeId: renderScopeId,
	});
}
</script>

<style lang="scss">
.blf-form-system {
	--blf-accent: #337ab7;
	--blf-accent-soft: #d9edf7;
	--blf-border: #ccc;
	--blf-border-strong: #adadad;
	--blf-panel: #f7f9fb;
	--blf-text-muted: #777;
	color: #333;
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
	padding: 6px 12px;
	color: #555;
	line-height: 1.42857143;
	box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075);
	transition:
		border-color ease-in-out 0.15s,
		box-shadow ease-in-out 0.15s;
}

.blf-input:focus {
	border-color: #66afe9;
	box-shadow:
		inset 0 1px 1px rgba(0, 0, 0, 0.075),
		0 0 8px rgba(102, 175, 233, 0.6);
	outline: none;
}

.blf-field {
	display: grid;
	gap: 6px;
	min-width: 0;
}

.blf-field--variant-simple {
	gap: 4px;
	padding: 12px 14px;
	border: 1px solid color-mix(in srgb, var(--blf-border) 72%, white);
	border-radius: 10px;
	background: linear-gradient(180deg, #fff 0%, #f9fbfd 100%);
}

.blf-field--variant-simple > label,
.blf-field--variant-simple legend {
	font-size: 0.82em;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--blf-text-muted);
}

.blf-field--variant-simple .blf-help-text {
	display: none;
}

.blf-field--variant-large > label,
.blf-field--variant-large legend {
	font-size: 1em;
}

.blf-field--variant-large :is(.blf-input, textarea, select, .dropdown-toggle) {
	min-height: 44px;
	padding: 10px 14px;
	font-size: 1.05em;
	line-height: 1.5;
}

.blf-field--variant-large :is(.btn, .blf-segmented button, .blf-targets button, .list-group-item) {
	font-size: 1.02em;
	padding: 9px 14px;
}

.blf-field--variant-large .querybox {
	min-height: 11rem;
}

.blf-container {
	min-width: 0;
}

.blf-container-title {
	font-weight: 700;
	margin: 0 0 8px;
}

.blf-container-list {
	display: grid;
	gap: 14px;
	min-width: 0;
	align-content: start;
}

.blf-container.blf-columns > .blf-container-list {
	grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
	align-items: start;
}

.blf-tabs {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 2px;
	margin: 0 0 15px;
	padding-left: 0;
	border-bottom: 1px solid #ddd;
	list-style: none;
}

.blf-tabs button {
	margin: 0 0 -1px;
	border: 1px solid transparent;
	border-radius: 4px 4px 0 0;
	background: transparent;
	padding: 10px 15px;
	color: #337ab7;
	line-height: 1.42857143;
	cursor: pointer;
}

.blf-tabs button:hover,
.blf-tabs button:focus-visible {
	border-color: #eee #eee #ddd;
	background: #eee;
	color: #23527c;
	outline: none;
}

.blf-tabs button.active {
	border-color: #ddd #ddd transparent;
	background: #fff;
	color: #555;
	font-weight: 400;
	cursor: default;
}

.blf-tabs.blf-tabs-small button {
	padding: 4px 15px;
	font-size: 0.95em;
}

.blf-tab-panel {
	min-width: 0;
}

.presentation-small-tabs > .blf-tab-panel > .blf-container > .blf-container-list {
	max-height: 385px;
	overflow: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

.blf-field > label,
.blf-field legend {
	font-weight: 600;
	font-size: 0.95em;
	margin: 0;
}

.blf-field fieldset {
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

.blf-dual-input {
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

@media (max-width: 760px) {
	.blf-container.blf-columns > .blf-container-list {
		grid-template-columns: 1fr;
	}
}
</style>
