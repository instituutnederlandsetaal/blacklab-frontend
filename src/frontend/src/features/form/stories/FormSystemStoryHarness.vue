<template>
	<div class="story-harness">
		<div class="surface">
			<FormSystem :definition="definition" :context="context" :initial-state="initialState" @ready="handleReady" @submit="handleSubmit" />
		</div>
		<aside class="inspector">
			<section>
				<h3>Live state</h3>
				<pre>{{ runtimeState || 'Waiting for runtime.' }}</pre>
			</section>
			<section>
				<h3>Submitted</h3>
				<pre>{{ submittedState || 'Submit the active form.' }}</pre>
			</section>
			<section>
				<h3>URL codec</h3>
				<pre>{{ encodedSubmitted || 'No submitted snapshot yet.' }}</pre>
			</section>
		</aside>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';

import { encodeSubmittedForm, FormSystem, type FormRuntimeContext, type FormState, type FormSystemDefinition, type FormSystemRuntime, type PersistableSubmittableFormState } from '../index';

const props = defineProps<{
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
	initialState?: FormState;
	initialSubmitted?: PersistableSubmittableFormState | null;
}>();

const runtime = shallowRef<FormSystemRuntime | null>(null);
const submittedState = ref<PersistableSubmittableFormState | null>(props.initialSubmitted ?? null);
const runtimeState = computed(() => runtime.value?.state.value ?? props.initialState ?? null);
const encodedSubmitted = computed(() => (submittedState.value ? encodeSubmittedForm(submittedState.value) : null));

function handleReady(nextRuntime: FormSystemRuntime) {
	runtime.value = nextRuntime;
}

function handleSubmit(_formId: string, snapshot: PersistableSubmittableFormState) {
	submittedState.value = snapshot;
}
</script>

<style lang="scss" scoped>
.story-harness {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(320px, 430px);
	gap: 18px;
	min-height: 100vh;
	// background: #eef3f7;
	padding: 18px;
}

.surface,
.inspector section {
	border: 1px solid #ccd5df;
	border-radius: 6px;
	background: #fff;
	padding: 14px;
}

.inspector {
	display: grid;
	align-content: start;
	gap: 12px;
}

h3 {
	font-size: 14px;
	margin: 0 0 8px;
}

pre {
	max-height: 28vh;
	overflow: auto;
	border-radius: 4px;
	background: #17212b;
	color: #d7e4ef;
	font-size: 12px;
	line-height: 1.45;
	margin: 0;
	padding: 10px;
	white-space: pre-wrap;
}

@media (max-width: 1000px) {
	.story-harness {
		grid-template-columns: 1fr;
	}
}
</style>
