<template>
	<section :class="containerClasses">
		<header v-if="node.title" class="blf-container-title">{{ node.title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', node.config?.variant === 'small-tabs' ? 'small' : '']" aria-label="Form section tabs">
				<button v-for="child in node.children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChildContainer(child.id)">
					{{ child.title || child.id }}
				</button>
			</nav>
			<div class="blf-tab-panel">
				<NodeRenderer v-if="activeChild" :node="activeChild" />
			</div>
		</template>

		<div v-else class="blf-container-list">
			<NodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
		</div>
	</section>
</template>

<script setup lang="ts">
import type { FormContainerNode } from '@/features/form/model/types/form-shape';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';

import NodeRenderer from './NodeRenderer.vue';

defineOptions({ name: 'ContainerRenderer' });

const props = defineProps<{
	node: FormContainerNode;
}>();

const { runtime, isTabbed, activeChild, containerClasses, activateChildContainer } = containerRendererSetup(props);
</script>

<style lang="scss" scoped>
.blf-container {
	min-width: 0;
}

.blf-container-title {
	font-weight: 700;
	margin-bottom: 8px;
}

.blf-container-list {
	display: grid;
	gap: 14px;
}

.blf-container.blf-columns > .blf-container-list {
	grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
	align-items: start;
}

.blf-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
	border-bottom: 1px solid var(--blf-border);
	margin-bottom: 12px;
}

.blf-tabs button {
	border: 1px solid transparent;
	border-bottom: 0;
	background: transparent;
	border-radius: 4px 4px 0 0;
	padding: 8px 12px;
	cursor: pointer;
	color: #34495e;
}

.blf-tabs.small button {
	padding: 5px 9px;
	font-size: 0.9em;
}

.blf-tabs button.active {
	border-color: var(--blf-border);
	background: #fff;
	color: #0f3554;
	font-weight: 600;
	margin-bottom: -1px;
	padding-bottom: 9px;
}

.blf-tab-panel {
	min-width: 0;
}

@media (max-width: 760px) {
	.blf-container.blf-columns > .blf-container-list {
		grid-template-columns: 1fr;
	}
}
</style>
