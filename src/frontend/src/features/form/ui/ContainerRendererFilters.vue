<template>
	<section :class="containerClasses">
		<header v-if="node.title" class="blf-container-title">{{ node.title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', node.config?.variant === 'small-tabs' ? 'small' : '']" aria-label="Form section tabs">
				<button v-for="child in node.children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChildContainer(child.id)">
					{{ child.title || child.id }}
					<span v-if="activeFiltersMap[child.id]" class="badge">{{ activeFiltersMap[child.id] }}</span>
				</button>
			</nav>
			<div class="blf-tab-panel">
				<NodeRenderer v-if="activeChild" :node="activeChild" />
			</div>
		</template>

		<div v-else-if="node.children.length" class="blf-container-list">
			<NodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
		</div>
		<!-- TODO i18n -->
		<div v-else class="empty">No filters configured.</div>
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
}>();

const { runtime, isTabbed, activeChild, containerClasses, activateChildContainer } = containerRendererSetup(props);
const parentForm = useParentForm();

const childGroups = computed<Set<string>>(() => new Set(props.node.children.filter(isContainerNode).map(child => child.id)));

// TODO need to filter descendants to filters only. Might need to manually traverse and collect?
// Should probably just improve the automatic summary system to support this natively.
// also assumes that the summaries include the group id, which might not be the case.
const activeFiltersMap = computed<Record<string, number>>(() =>
	parentForm.summaries.reduce<Record<string, number>>((acc, summary) => {
		if (summary.group != null && childGroups.value.has(summary.group) && summary.value) {
			acc[summary.group] = (acc[summary.group] ?? 0) + 1;
		}
		return acc;
	}, {}),
);
</script>

<style lang="scss" scoped>
.blf-filter-panel {
	display: grid;
	gap: 10px;
}

header {
	font-weight: 700;
}

.filter-container {
	display: grid;
	gap: 12px;
	max-height: 385px;
	overflow: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

h4 {
	font-size: 0.95em;
	margin: 0;
}

hr {
	border: 0;
	border-top: 1px solid var(--blf-border);
	width: 100%;
}

.badge {
	display: inline-block;
	min-width: 1.5em;
	border-radius: 999px;
	background: var(--blf-accent-soft);
	padding: 1px 6px;
	font-size: 0.85em;
}

.empty {
	color: var(--blf-text-muted);
	font-style: italic;
}
</style>
