<template>
	<section :class="containerClasses">
		<header v-if="title && !hideTitle" class="blf-container-title">{{ title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', { 'blf-tabs-small': isSmallTabs }]" aria-label="Form section tabs">
				<button v-for="child in children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChild(child.id)">
					{{ child.title || child.id }}
					<span v-if="activeSummaryCounts[child.id]" class="blf-tab-count">{{ activeSummaryCounts[child.id] }}</span>
				</button>
			</nav>
			<div class="blf-tab-panel">
				<Component v-if="activeChild" :is="resolveNodeComponent(activeChild)" :key="activeChild.id" v-bind="nodeProps(activeChild, true)" />
			</div>
		</template>

		<div v-else-if="children.length" class="blf-container-list">
			<Component v-for="child in children" :is="resolveNodeComponent(child)" :key="child.id" v-bind="nodeProps(child)" />
		</div>
		<!-- TODO i18n -->
		<div v-else class="blf-empty-state">Nothing configured.</div>
	</section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { isContainerNode } from '@/features/form/model/form-utils';
import { useParentForm } from '@/features/form/model/runtime';
import type { FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';
import useUid from '@/shared/utils/useUid';
import { getNodeProps, resolveNodeComponent } from '@/features/form/ui/node-render';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<ImplicitContainerComponentProps>();

const { runtime, isTabbed, isSmallTabs, activeChild, containerClasses, activateChild } = containerRendererSetup(props);
const parentForm = useParentForm();
const renderScopeId = useUid();

function nodeProps(node: FormNode, hideTitle = false) {
	return getNodeProps(node, {
		hideTitle,
		runtime,
		scopeId: renderScopeId,
	});
}

const childGroups = computed<Set<string>>(() => new Set(props.children.filter(isContainerNode).map(child => child.id)));

// TODO: count summaries for the active top-level child group more reliably by traversing descendants.
const activeSummaryCounts = computed<Record<string, number>>(() =>
	parentForm.summaries.reduce<Record<string, number>>((acc, summary) => {
		if (summary.group != null && childGroups.value.has(summary.group) && summary.value) {
			acc[summary.group] = (acc[summary.group] ?? 0) + 1;
		}
		return acc;
	}, {}),
);
</script>

<style lang="scss" scoped>
.blf-tab-count {
	display: inline-block;
	min-width: 10px;
	border-radius: 10px;
	background: #aaa;
	color: #fff;
	padding: 3px 7px;
	font-size: 12px;
	font-weight: 700;
	line-height: 1;
	vertical-align: baseline;
	margin-left: 6px;
}

.blf-empty-state {
	color: var(--blf-text-muted);
	font-style: italic;
}
</style>
