<template>
	<Component :is="isForm ? 'form' : 'section'" :class="containerClasses" @submit.prevent="submit" @reset.prevent="reset">
		<header v-if="title && !hideTitle" :class="isForm ? 'panel-heading blf-form-title' : 'blf-container-title'">{{ title }}</header>

		<template v-if="presentation.tabs || presentation['small-tabs']">
			<ul :class="['nav', 'nav-tabs', { 'nav-tabs-small': presentation['small-tabs'] }]" role="tablist">
				<li v-for="child in children" :key="child.id" :class="{ active: activeChildId === child.id }" role="presentation">
					<a href="#" role="tab" :aria-selected="activeChildId === child.id" @click.prevent="activeChildId = child.id">{{ child.title || child.id }}</a>
				</li>
			</ul>
			<div :class="['tab-content', { 'panel-body': isForm }]">
				<div v-if="activeChild" class="tab-pane active" role="tabpanel">
					<Component :is="resolveNodeComponent(activeChild)" v-bind="nodeProps(activeChild, true)" :key="activeChildId" />
				</div>
			</div>
		</template>

		<div v-else :class="isForm ? 'panel-body blf-form-body' : 'blf-container-list'">
			<Component v-for="child in children" :is="resolveNodeComponent(child)" :key="child.id" v-bind="nodeProps(child)" />
		</div>

		<footer v-if="isForm" class="panel-footer blf-form-actions">
			<button class="btn btn-primary" type="submit">Submit</button>
			<button class="btn btn-default" type="reset">Reset</button>
		</footer>
	</Component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';

import { createAndProvideParentForm } from '../model/runtime';
import { getNodeProps, resolveNodeComponent } from './node-render';

import useUid from '@/shared/utils/useUid';

// InheritAttrs false to prevent rendering extra properties in dom, such as functions passed as props
// Due to how we pass props, this component would otherwise render a lot of unwanted attributes on the container element, such as util methods on the form node object etc.
defineOptions({ name: 'ContainerRenderer', inheritAttrs: false });

const props = defineProps<ImplicitContainerComponentProps>();

const { runtime, presentation, activeChildId, activeChild } = containerRendererSetup(props);
const isForm = computed(() => props.kind === 'form');
const renderScopeId = useUid();

const containerClasses = computed(() => ['blf-container', props.kind === 'form' ? 'blf-form panel panel-default' : null, presentation.value, props.class]);

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
	margin-bottom: 0;
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
}
</style>
