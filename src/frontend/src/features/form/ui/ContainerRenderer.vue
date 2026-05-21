<template>
	<section :class="containerClasses">
		<header v-if="node.title && !hideTitle" class="blf-container-title">{{ node.title }}</header>

		<template v-if="isTabbed">
			<nav :class="['blf-tabs', { 'blf-tabs-small': node.config?.variant === 'small-tabs' }]" aria-label="Form section tabs">
				<button v-for="child in node.children" :key="child.id" type="button" :class="{ active: activeChild?.id === child.id }" @click="activateChildContainer(child.id)">
					{{ child.title || child.id }}
				</button>
			</nav>
			<div class="blf-tab-panel">
				<NodeRenderer v-if="activeChild" :node="activeChild" hide-title />
			</div>
		</template>

		<div v-else class="blf-container-list">
			<NodeRenderer v-for="child in node.children" :key="child.id" :node="child" />
		</div>
	</section>
</template>

<script setup lang="ts">
import type { FormContainerNode } from '@/features/form/model/types/form-shape';

import containerRendererSetup from './ContainerRendererSetup';

import NodeRenderer from './NodeRenderer.vue';

defineOptions({ name: 'ContainerRenderer' });

const props = defineProps<{
	node: FormContainerNode;
	hideTitle?: boolean;
}>();

const { runtime, isTabbed, activeChild, containerClasses, activateChildContainer } = containerRendererSetup(props);
</script>
