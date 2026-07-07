<template>
	<Component :is="isForm ? 'form' : 'section'" :class="containerClasses" @submit.prevent.stop="submit" @reset.prevent.stop="reset">
		<header v-if="title && !hideTitle" :class="isForm ? 'panel-heading blf-form-title' : 'blf-container-title'">
			{{ title }}
		</header>

		<template v-if="presentation.tabs || presentation['small-tabs']">
			<ul :class="['nav', 'nav-tabs', { 'nav-tabs-small': presentation['small-tabs'] }]" role="tablist">
				<li v-for="child in children" :key="child.props.id" :class="{ active: activeChildId === child.props.id }" role="presentation">
					<a href="#" role="tab" :aria-selected="activeChildId === child.props.id" @click.prevent="activeChildId = child.props.id">{{ child.props.title || child.props.id }}</a>
				</li>
			</ul>
			<div :class="['tab-content', { 'panel-body': isForm }]">
				<div v-if="activeChild" class="tab-pane active" role="tabpanel">
					<Component :is="activeChild.is" v-bind="activeChild.props" :key="activeChildId" />
				</div>
			</div>
		</template>

		<div v-else :class="isForm ? 'panel-body blf-form-body' : 'blf-container-list'">
			<Component v-for="child in children" :is="child.is" v-bind="child.props" :key="child.props.id" />
		</div>

		<footer v-if="isForm" class="panel-footer blf-form-actions">
			<button class="btn btn-primary" type="submit">{{ $t(`queryForm.search`) }}</button>
			<button class="btn btn-default" type="reset">{{ $t(`queryForm.reset`) }}</button>
		</footer>
	</Component>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';

import { provideParentForm } from '@/features/form/model/runtime';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';

import type { ImplicitContainerComponentProps } from '../model/types';

// InheritAttrs false to prevent rendering extra properties in dom, such as functions passed as props
// Due to how we pass props, this component would otherwise render a lot of unwanted attributes on the container element, such as util methods on the form node object etc.
defineOptions({ name: 'ContainerRenderer', inheritAttrs: false });

const props = defineProps<ImplicitContainerComponentProps>();
const { runtime, presentation, activeChildId, activeChild } = containerRendererSetup(props);
const isForm = computed(() => props.kind === 'form');

const containerClasses = computed(() => ['blf-container', props.kind === 'form' ? 'blf-form panel panel-default' : null, presentation.value, props.class]);

if (props.kind === 'form') {
	provideParentForm(toRef(props, 'id'));
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
