<template>
	<section :class="containerClasses">
		<header v-if="node.title && !hideTitle" class="blf-container-title">{{ node.title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', { 'blf-tabs-small': node.config?.variant === 'small-tabs' }]" aria-label="Form section tabs">
				<button v-for="child in node.children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChildContainer(child.id)">
					{{ child.title || child.id }}
					<span v-if="activeSummaryCounts[child.id]" class="blf-tab-count">{{ activeSummaryCounts[child.id] }}</span>
				</button>
			</nav>
			<div class="blf-tab-panel">
				<NodeRenderer v-if="activeChild" :node="activeChild" hide-title />
			</div>
		</template>

		<div v-else-if="node.children.length" class="blf-container-list">
			<NodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
		</div>
		<!-- TODO i18n -->
		<div v-else class="blf-empty-state">Nothing configured.</div>
	</section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { isContainerNode } from '@/features/form/model/form-utils';
import { useParentForm } from '@/features/form/model/runtime';
import type { FormContainerNode } from '@/features/form/model/types/form-shape';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';

import NodeRenderer from '@/features/form/ui/NodeRenderer.vue';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<{
	node: FormContainerNode;
	hideTitle?: boolean;
}>();

const { runtime, isTabbed, activeChild, containerClasses, activateChildContainer } = containerRendererSetup(props);
const parentForm = useParentForm();

const childGroups = computed<Set<string>>(() => new Set(props.node.children.filter(isContainerNode).map(child => child.id)));

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
