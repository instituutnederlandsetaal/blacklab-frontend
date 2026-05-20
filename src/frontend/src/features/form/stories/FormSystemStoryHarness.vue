<template>
	<div class="story-harness">
		<div class="surface">
			<FormSystem v-model:state="draftState" v-model:submitted="submittedState" :definition="definition" />
		</div>
		<aside class="inspector">
			<section>
				<h3>Draft</h3>
				<pre>{{ draftState }}</pre>
			</section>
			<section>
				<h3>Submitted</h3>
				<pre>{{ submittedState || 'Submit the active form.' }}</pre>
			</section>
			<section>
				<h3>URL Codec</h3>
				<pre>{{ encodedSubmitted || 'No submitted snapshot yet.' }}</pre>
			</section>
		</aside>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { createDraftFormState, encodeSubmittedSnapshot, FormSystem, type DraftFormState, type FormSystemDefinition, type SubmittedFormSnapshot } from '../index';

const props = defineProps<{
	definition: FormSystemDefinition;
	initialState?: DraftFormState;
	initialSubmitted?: SubmittedFormSnapshot | null;
}>();

const draftState = ref<DraftFormState>(props.initialState ?? createDraftFormState(props.definition));
const submittedState = ref<SubmittedFormSnapshot | null>(props.initialSubmitted ?? null);
const encodedSubmitted = computed(() => (submittedState.value ? encodeSubmittedSnapshot(submittedState.value) : null));
</script>

<style lang="scss" scoped>
.story-harness {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(320px, 430px);
	gap: 18px;
	min-height: 100vh;
	background: #eef3f7;
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
