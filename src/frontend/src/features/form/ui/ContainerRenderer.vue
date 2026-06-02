<template>
	<Component :is="isForm ? 'form' : 'section'" :class="containerClasses" @submit.prevent="submit" @reset.prevent="reset">
		<header v-if="title && !hideTitle" :class="isForm ? 'blf-form-title' : 'blf-container-title'">{{ title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', { 'blf-tabs-small': isSmallTabs }]" aria-label="Form section tabs">
				<button v-for="child in children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChild(child.id)">
					{{ child.title || child.id }}
				</button>
			</nav>
			<div :class="['blf-tab-panel', isForm ? 'blf-form-body' : null]">
				<Component v-if="activeChild" :is="resolveNodeComponent(activeChild)" :key="activeChild.id" v-bind="nodeProps(activeChild, true)" />
			</div>
		</template>

		<div v-else :class="isForm ? 'blf-form-body' : 'blf-container-list'">
			<Component v-for="child in children" :is="resolveNodeComponent(child)" :key="child.id" v-bind="nodeProps(child)" />
		</div>

		<footer v-if="isForm" class="blf-form-actions">
			<button class="primary" type="submit">Submit</button>
			<button type="reset">Reset</button>
		</footer>
	</Component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';
import { createAndProvideParentForm } from '../model/runtime';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';
import useUid from '@/shared/utils/useUid';
import { getNodeProps, resolveNodeComponent } from './node-render';

defineOptions({ name: 'ContainerRenderer' });

const props = defineProps<ImplicitContainerComponentProps>();

const { runtime, isTabbed, isSmallTabs, activeChild, containerClasses, activateChild } = containerRendererSetup(props);
const isForm = computed(() => props.kind === 'form');
const renderScopeId = useUid();

if (props.kind === 'form') {
	createAndProvideParentForm(runtime, () => props.id);
}

function nodeProps(node: FormNode, hideTitle = false) {
	return getNodeProps(node, {
		hideTitle,
		runtime,
		scopeId: renderScopeId,
	});
}

function submit() {
	if (props.kind === 'form') runtime.submit(props.id);
}

function reset() {
	if (props.kind === 'form') runtime.reset();
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
