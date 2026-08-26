<template>
	<div class="story-harness">
		<FormSystem :runtime @submit="handleSubmit" />
		<aside class="inspector">
			<section class="toggles">
				<div class="checkbox" v-for="output in outputs" :key="output.key">
					<label><input v-model="output.visible" type="checkbox" />{{ output.label }} </label>
				</div>
			</section>
			<section v-if="showLiveState">
				<h3>Live state</h3>
				<pre>{{ serializedState }}</pre>
			</section>
			<section v-if="showCompiled">
				<h3>Compiled</h3>
				<pre>{{ serializedCompiled || 'No forms available.' }}</pre>
			</section>
			<section v-if="showSubmitted">
				<h3>Submitted</h3>
				<pre>{{ serializedSubmitted || 'Submit the active form.' }}</pre>
			</section>
			<section v-if="showUrlCodec">
				<h3>URL codec</h3>
				<pre>{{ encodedSubmitted || 'No submitted snapshot yet.' }}</pre>
			</section>
		</aside>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from 'vue';

import { getAllNodes } from '@/features/form/model/form-utils';

import { FormSystem, type CompiledFormResult, type FieldPresentation, type FormRuntime } from '../index';

const props = defineProps<{
	runtime: FormRuntime;
	initialSubmitted?: CompiledFormResult | null;
	variant?: FieldPresentation | FieldPresentation[];
}>();

const submittedState = ref<CompiledFormResult | null>(props.initialSubmitted ?? null);
const outputs = reactive([
	{ key: 'live-state', label: 'Live state', visible: true },
	{ key: 'compiled', label: 'Compiled', visible: true },
	{ key: 'submitted', label: 'Submitted', visible: true },
	{ key: 'url-codec', label: 'URL codec', visible: false },
]);
const showLiveState = computed(() => isOutputVisible('live-state'));
const showCompiled = computed(() => isOutputVisible('compiled'));
const showSubmitted = computed(() => isOutputVisible('submitted'));
const showUrlCodec = computed(() => isOutputVisible('url-codec'));
const allFields = computed(() => getAllNodes(props.runtime.definition.getRoot(), 'field'));
const serializedState = computed(() => JSON.stringify(props.runtime.state.state.value, undefined, 2));
const serializedSubmitted = computed(() => (submittedState.value ? JSON.stringify(submittedState.value, undefined, 2) : ''));
const serializedCompiled = computed(() => {
	const formIds = props.runtime.definition.formsList.map(form => form.id);
	return formIds.length ? JSON.stringify(Object.fromEntries(formIds.map(id => [id, props.runtime.compile(id)])), undefined, 2) : '';
});
const encodedSubmitted = computed(() => submittedState.value?.encoded ?? null);

watchEffect(() => {
	allFields.value.forEach(field => (field.variant = props.variant));
});

function handleSubmit(snapshot: CompiledFormResult) {
	submittedState.value = snapshot;
}

function isOutputVisible(key: string) {
	return outputs.find(output => output.key === key)?.visible ?? false;
}
</script>

<style lang="scss" scoped>
.story-harness {
	--story-harness-gap: 16px;

	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(320px, 430px);
	gap: var(--story-harness-gap);
	min-height: 100vh;
	// background: #eef3f7;
	padding: var(--story-harness-gap);
}

.inspector section {
	border: 1px solid #ccd5df;
	border-radius: 6px;
	background: #fff;
	padding: 14px;
}

.inspector {
	display: grid;
	align-content: start;
	gap: var(--story-harness-gap);
}

.toggles {
	display: flex;
	gap: var(--story-harness-gap);
	// grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	// gap: var(--story-harness-gap);
	> .checkbox {
		margin: 0;
		padding: 0;
	}
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
