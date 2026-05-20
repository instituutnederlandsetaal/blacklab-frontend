<template>
	<form class="blf-form" @submit.prevent="submit" @reset.prevent="reset">
		<header v-if="node.title" class="blf-form-title">{{ node.title }}</header>
		<div class="blf-form-body">
			<NodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
		</div>
		<footer class="blf-form-actions">
			<button class="primary" type="submit">Submit</button>
			<button type="reset">Reset</button>
		</footer>
	</form>
</template>

<script setup lang="ts">
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';

import { createAndProvideParentForm, useFormSystemRuntime } from '../model/runtime';

import NodeRenderer from '@/features/form/ui/NodeRenderer.vue';

const props = defineProps<{
	node: FormBoundaryNode;
}>();

const runtime = useFormSystemRuntime();
createAndProvideParentForm(runtime, () => props.node.id);

function submit() {
	runtime.submit(props.node.id);
}

function reset() {
	runtime.reset();
}
</script>

<style lang="scss" scoped>
.blf-form {
	display: grid;
	gap: 16px;
	border: 1px solid var(--blf-border);
	border-radius: 6px;
	background: var(--blf-panel);
	padding: 16px;
}

.blf-form-title {
	font-weight: 700;
	font-size: 1.15em;
}

.blf-form-body {
	display: grid;
	gap: 16px;
}

.blf-form-actions {
	display: flex;
	gap: 8px;
	justify-content: flex-start;
	border-top: 1px solid var(--blf-border);
	padding-top: 12px;
}

.blf-form-actions button {
	border: 1px solid var(--blf-border-strong);
	background: #fff;
	border-radius: 4px;
	padding: 7px 12px;
	cursor: pointer;
}

.blf-form-actions button.primary {
	background: var(--blf-accent);
	border-color: var(--blf-accent);
	color: #fff;
}
</style>
