<template>
	<component v-if="isTabbed" :is="isForm ? 'form' : 'div'" :class="containerClasses" @submit.stop.prevent="submit" @reset.stop.prevent="reset">
		<Tabs v-model="activeChildId" :tabs="tabs" :small="presentation['small-tabs']" :aria-label="resolvedTitle || 'Form sections'" :class="tabClasses">
			<template v-if="presentation['tab-badges']" #label="{ tab }">
				{{ tab.label }}
				<template v-if="activeQueryContributionCounts[tab.value]">
					&nbsp;
					<span class="badge">{{ activeQueryContributionCounts[tab.value] }}</span>
				</template>
			</template>
		</Tabs>

		<!-- todo something with active class, and show/hide mode in the tabs? might need to wrap this in tab component so suspense can work? -->
		<div v-if="activeChild" :id="tabId(props.id, activeChild.props.id, 'panel')" role="tabpanel" :aria-labelledby="tabId(props.id, activeChild.props.id)" :class="panelBodyClasses">
			<Component :is="activeChild.is" v-bind="activeChild.props" :key="activeChildId" hideTitle @submit="forwardSubmit" @reset="forwardReset">
				<template #actions><slot name="actions" /></template>
			</Component>
		</div>

		<div class="blf-form-actions btn-toolbar" v-if="isForm">
			<button class="btn btn-primary btn-lg" type="submit">{{ $t(`queryForm.search`) }}</button>
			<button class="btn btn-default btn-lg" type="reset">{{ $t(`queryForm.reset`) }}</button>
			<slot name="actions" />
		</div>
	</component>

	<component v-else :is="isForm ? 'form' : 'div'" @submit.stop.prevent="submit" @reset.stop.prevent="reset" :class="containerClasses">
		<div class="blf-form-content">
			<Component v-for="child in children" :is="child.is" v-bind="child.props" :key="child.props.id" @submit="forwardSubmit" @reset="forwardReset">
				<template #actions><slot name="actions" /></template>
			</Component>
		</div>

		<div class="blf-form-actions btn-toolbar" v-if="isForm">
			<button class="btn btn-primary btn-lg" type="submit">{{ $t(`queryForm.search`) }}</button>
			<button class="btn btn-default btn-lg" type="reset">{{ $t(`queryForm.reset`) }}</button>
			<slot name="actions" />
		</div>
	</component>
</template>

<script setup lang="ts">
import { computed, toRef, toValue } from 'vue';

import { hasEmissions } from '@/features/form/model/compile';
import { decodeVariants, getAllNodes } from '@/features/form/model/form-utils';
import { provideParentForm } from '@/features/form/model/runtime';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';
import { createTabs, tabId } from '@/features/form/ui/tab-utils';

import type { CompiledFormResult, ImplicitContainerComponentProps } from '../model/types';

import Tabs from '@/shared/ui/Tabs.vue';

// Controllers and interchangeable components intentionally accept overlapping,
// but not necessarily identical, node configuration. Keep valid controller-only
// configuration from falling through as attributes on the container DOM element.
defineOptions({ name: 'ContainerRenderer', inheritAttrs: false });

const props = defineProps<ImplicitContainerComponentProps>();
const emit = defineEmits<{
	submit: [snapshot: CompiledFormResult];
	reset: [];
}>();
const { runtime, presentation, activeChildId, activeChild } = containerRendererSetup(props);
const resolvedTitle = computed(() => (props.title ? toValue(props.title) : ''));
const tabs = computed(() => createTabs(props.id, props.children));

const variant = computed(() => decodeVariants(props.variant));

const activeQueryContributionCounts = computed<Record<string, number>>(() => {
	if (!presentation.value['tab-badges']) return {};

	const state = runtime.value.state.state.value;
	const context = runtime.value.definition.context;
	return Object.fromEntries(
		props.children.map(child => {
			const node = runtime.value.definition.getNode(child.props.id);
			const count = node ? getAllNodes(node, 'field').filter(field => hasEmissions(field, state[field.id], context)).length : 0;
			return [child.props.id, count];
		}),
	);
});

const isForm = computed(() => props.kind === 'form');
const isTabbed = computed(() => presentation.value['tabs'] || presentation.value['small-tabs']);
const containerClasses = computed(() => [
	'blf-form-container',
	isForm.value ? 'blf-form' : null,
	presentation.value['panel-tabs'] ? 'blf-form-surface' : null,
	variant.value,
	!isTabbed.value ? props.class : null,
]);
const tabClasses = computed(() => ['blf-form-container-tabs', props.class, presentation.value['panel-tabs'] ? 'blf-form-surface-tabs' : null]);
const panelBodyClasses = computed(() => ['blf-form-tab-body', presentation.value['panel-tabs'] ? 'blf-form-surface-body' : null]);

if (props.kind === 'form') {
	provideParentForm(toRef(props, 'id'));
}

function submit() {
	if (props.kind === 'form') emit('submit', runtime.value.compile(props.id));
}

function reset() {
	if (props.kind !== 'form') return;
	runtime.value.reset();
	emit('reset');
}

function forwardSubmit(snapshot: CompiledFormResult) {
	emit('submit', snapshot);
}

function forwardReset() {
	emit('reset');
}
</script>

<style lang="scss">
.blf-form-container,
.blf-form-content,
.blf-form-tab-body {
	min-width: 0;
}

.blf-form-surface {
	border: 1px solid var(--blf-border, #ccc);
	border-radius: 4px;
	background: rgba(255, 255, 255, 0.8);
	margin-bottom: 35px;
	transition:
		0.25s border-color,
		0.4s background-color;
}

.blf-form-surface:hover {
	border-color: var(--blf-border-strong, #adadad);
	background: #fff;
}

.blf-form-surface-body {
	padding: 20px 30px 30px;
}

.blf-form-actions {
	border-top: 1px solid #eee;
	margin-top: 20px;
	padding-top: 20px;
}

.blf-form-container.list > .blf-form-content {
	display: grid;
	gap: 15px;
	align-content: start;
}

.blf-form-container.list > .blf-form-content > .blf-field {
	margin-bottom: 0;
}

.blf-form-container.columns > .blf-form-content {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	column-gap: 30px;
	row-gap: 20px;

	> :not([class^='col-']):not([class*=' col-']) {
		flex: 1 1 320px;
		min-width: 320px;
	}

	> [class^='col-'],
	> [class*=' col-'] {
		flex: 0 0 auto;
		min-width: 0;
	}
}

.blf-form-container-tabs {
	margin-bottom: 10px;
}

.blf-form-container-tabs.blf-form-surface-tabs {
	margin-bottom: 0;
}

@media (max-width: 767px) {
	.blf-form-surface-body {
		padding: 15px;
	}

	.blf-form-container.columns > .blf-form-content {
		row-gap: 15px;

		> * {
			flex-basis: 100%;
			min-width: 0;
		}
	}
}
</style>
