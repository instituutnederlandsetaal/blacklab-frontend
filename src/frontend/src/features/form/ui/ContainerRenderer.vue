<template>
	<component v-if="isTabbed" :is="isForm ? 'form' : 'div'" :class="{ 'panel panel-default blf-form-container': isForm, ...variant }" @submit.stop.prevent="submit" @reset.stop.prevent="reset">
		<!-- todo variant classes? -->

		<Tabs v-model="activeChildId" :tabs="tabs" :small="presentation['small-tabs']" :aria-label="resolvedTitle || 'Form sections'" class="panel-heading blf-form-container-tabs">
			<template v-if="presentation['tab-badges']" #label="{ tab }">
				{{ tab.label }}
				<template v-if="activeQueryContributionCounts[tab.value]">
					&nbsp;
					<span class="badge">{{ activeQueryContributionCounts[tab.value] }}</span>
				</template>
			</template>
		</Tabs>

		<!-- todo something with active class, and show/hide mode in the tabs? might need to wrap this in tab component so suspense can work? -->
		<div v-if="activeChild" :id="tabPanelId(props.id, activeChild.props.id)" role="tabpanel" :aria-labelledby="tabId(props.id, activeChild.props.id)">
			<Component :is="activeChild.is" v-bind="activeChild.props" :key="activeChildId" hideTitle @submit="forwardSubmit" @reset="forwardReset" />
		</div>

		<div class="panel-footer blf-form-actions" v-if="isForm">
			<button class="btn btn-primary" type="submit">{{ $t(`queryForm.search`) }}</button>
			<button class="btn btn-default" type="reset">{{ $t(`queryForm.reset`) }}</button>
		</div>
	</component>

	<component v-else :is="isForm ? 'form' : 'div'" @submit.stop.prevent="submit" @reset.stop.prevent="reset" :class="['blf-form-container', variant]">
		<Component v-for="child in children" :is="child.is" v-bind="child.props" :key="child.props.id" @submit="forwardSubmit" @reset="forwardReset" />

		<div class="panel-footer blf-form-actions" v-if="isForm">
			<button class="btn btn-primary" type="submit">{{ $t(`queryForm.search`) }}</button>
			<button class="btn btn-default" type="reset">{{ $t(`queryForm.reset`) }}</button>
		</div>
	</component>
</template>

<script setup lang="ts">
import { computed, toRef, toValue } from 'vue';

import { hasQueryContributions } from '@/features/form/model/compile/query-artifact';
import { decodeVariants, getAllNodes } from '@/features/form/model/form-utils';
import { provideParentForm } from '@/features/form/model/runtime';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';
import { createTabs, tabId, tabPanelId } from '@/features/form/ui/tab-utils';

import type { CompiledFormStateWithSummaries, ImplicitContainerComponentProps } from '../model/types';

import Tabs from '@/shared/ui/Tabs.vue';

// InheritAttrs false to prevent rendering extra properties in dom, such as functions passed as props
// Due to how we pass props, this component would otherwise render a lot of unwanted attributes on the container element, such as util methods on the form node object etc.
defineOptions({ name: 'ContainerRenderer', inheritAttrs: false });

const props = defineProps<ImplicitContainerComponentProps>();
const emit = defineEmits<{
	submit: [snapshot: CompiledFormStateWithSummaries];
	reset: [];
}>();
const { runtime, presentation, activeChildId, activeChild } = containerRendererSetup(props);
const resolvedTitle = computed(() => (props.title ? toValue(props.title) : ''));
const tabs = computed(() => createTabs(props.id, props.children));

const variant = computed(() => decodeVariants(props.variant));

const activeQueryContributionCounts = computed<Record<string, number>>(() => {
	if (!presentation.value['tab-badges']) return {};

	return Object.fromEntries(
		props.children.map(child => {
			const node = runtime.value.definition.getNode(child.props.id);
			const count = node
				? getAllNodes(node, 'field').filter(field =>
						hasQueryContributions(field.controller.getQueryContribution(field, runtime.value.definition.context, runtime.value.state.state.value[field.id]).query),
					).length
				: 0;
			return [child.props.id, count];
		}),
	);
});

const isForm = computed(() => props.kind === 'form');
const isTabbed = computed(() => presentation.value['tabs'] || presentation.value['small-tabs']);

// const containerClasses = computed(() => ['blf-container', props.kind === 'form' ? 'blf-form panel panel-default' : null, presentation.value, props.class]);

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

function forwardSubmit(snapshot: CompiledFormStateWithSummaries) {
	emit('submit', snapshot);
}

function forwardReset() {
	emit('reset');
}
</script>

<style lang="scss">
.blf-form-body {
	display: grid;
	gap: 16px;
}

.blf-form-actions {
	display: flex;
	gap: 8px;
	justify-content: flex-start;
}

.blf-form-container.columns {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	gap: 30px;

	> * {
		flex: 1;
		flex-basis: auto;
	}

	> .blf-form-actions {
		width: 100%;
	}
}

.blf-form-container-tabs {
	margin-bottom: 10px;
}
</style>
