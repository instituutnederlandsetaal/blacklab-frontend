<template>
	<component :is="isForm ? 'form' : 'div'" :class="containerClasses" :style="props.style" @submit.stop.prevent="submit" @reset.stop.prevent="reset">
		<Tabs
			v-if="isTabbed"
			v-model="activeChildId"
			:tabs="tabs"
			:small="tabSize === 'small'"
			:aria-label="toValue(props.title) || 'Form sections'"
			:class="['blf-form-container-tabs', `tabs-${tabTone ?? 'plain'}`, tabsClass]"
			:style="tabsStyle"
		>
			<template v-if="showTabBadges" #label="{ tab }">
				{{ tab.label }}
				<template v-if="activeQueryContributionCounts[tab.value]?.value">
					&nbsp;
					<span class="badge">{{ activeQueryContributionCounts[tab.value]?.value }}</span>
				</template>
			</template>
		</Tabs>

		<div
			v-if="!isTabbed || activeChild"
			:id="isTabbed && activeChild ? tabId(props.id, activeChild.props.id, 'panel') : undefined"
			:role="isTabbed ? 'tabpanel' : undefined"
			:aria-labelledby="isTabbed && activeChild ? tabId(props.id, activeChild.props.id) : undefined"
			:class="['blf-form-content', layout ?? 'list', bodyClass]"
			:style="bodyStyle"
		>
			<Component v-for="child in renderedChildren" :is="child.is" v-bind="child.props" :key="child.props.id" :hideTitle="isTabbed || undefined" @submit="emit('submit', $event)" @reset="emit('reset')">
				<template #actions><slot name="actions" /></template>
			</Component>
		</div>

		<div v-if="isForm" class="blf-form-actions btn-toolbar">
			<button class="btn btn-primary btn-lg" type="submit">{{ $t(`queryForm.search`) }}</button>
			<button class="btn btn-default btn-lg" type="reset">{{ $t(`queryForm.reset`) }}</button>
			<slot name="actions" />
		</div>
	</component>
</template>

<script setup lang="ts">
import { computed, toRef, toValue } from 'vue';

import { hasEmissions } from '@/features/form/model/compile';
import { getAllNodes } from '@/features/form/model/form-utils';
import { provideParentForm, useFormSystemRuntime } from '@/features/form/model/runtime';
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
const runtime = useFormSystemRuntime();
const isForm = computed(() => props.kind === 'form');
const isTabbed = computed(() => props.mode === 'tabs');
const showTabBadges = computed(() => isTabbed.value && toValue(props.tabBadges));
const activeChildId = computed({
	get: () => runtime.value.state.uiState.value[props.id] ?? props.children[0]?.props.id ?? null,
	set: (value: string) => {
		runtime.value.state.uiState.value[props.id] = value;
	},
});
const activeChild = computed(() => props.children.find(child => child.props.id === activeChildId.value) ?? null);
const renderedChildren = computed(() => (isTabbed.value ? (activeChild.value ? [activeChild.value] : []) : props.children));

const tabs = computed(() => createTabs(props.id, props.children));

const activeQueryContributionCounts = computed(() => {
	if (!showTabBadges.value) return {};
	const session = runtime.value;
	return Object.fromEntries(
		props.children.map(child => {
			const node = session.definition.getNode(child.props.id);
			const contributions = node ? getAllNodes(node, 'field').map(field => computed(() => hasEmissions(field, session.state.state.value[field.id], session.definition.context))) : [];
			return [child.props.id, computed(() => contributions.filter(contribution => contribution.value).length)];
		}),
	);
});

const containerClasses = computed(() => ['blf-form-container', isForm.value ? 'blf-form' : null, props.frame === 'panel' ? 'panel panel-default' : null, props.class]);

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
</script>

<style lang="scss">
.blf-form-container,
.blf-form-content {
	min-width: 0;
}

.blf-form-container.panel > .blf-form-content {
	padding: 15px;
}

.blf-form-actions {
	border-top: 1px solid #eee;
	margin-top: 20px;
	padding-top: 20px;
}

.blf-form-content.list {
	display: grid;
	gap: 15px;
	align-content: start;
}

.blf-form-content.list > .blf-field {
	margin-bottom: 0;
}

.blf-form-content.columns {
	display: flex;
	flex-direction: row;
	flex-wrap: wrap;
	column-gap: 30px;
	row-gap: 20px;

	> :not([class^='col-']):not([class*=' col-']) {
		flex: 1 1 320px;
		min-width: 0;
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

.blf-form-container.panel > .blf-form-container-tabs {
	margin: -1px -1px 0;
}

.blf-form-container.panel > .blf-form-actions {
	margin: 0;
	padding: 15px;
}

@media (max-width: 767px) {
	.blf-form-content.columns {
		row-gap: 15px;

		> * {
			flex-basis: 100%;
			min-width: 0;
		}
	}
}
</style>
