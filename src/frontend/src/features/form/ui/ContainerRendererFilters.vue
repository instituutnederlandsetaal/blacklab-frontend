<template>
	<section :class="containerClasses">
		<header v-if="title && !hideTitle" class="blf-container-title">{{ title }}</header>

		<template v-if="isTabbed">
			<ul :class="['nav', 'nav-tabs', { 'nav-tabs-small': isSmallTabs }]" role="tablist">
				<li v-for="child in children" :key="child.props.id" :class="{ active: activeChildId === child.props.id }" role="presentation">
					<a href="#" role="tab" :aria-selected="activeChildId === child.props.id" @click.prevent="activeChildId = child.props.id">
						{{ resolveTitle(child.props) }}
						<span v-if="activeSummaryCounts[child.props.id]" class="badge">{{ activeSummaryCounts[child.props.id] }}</span>
					</a>
				</li>
			</ul>
			<div class="tab-content">
				<div v-if="activeChild" class="tab-pane active" role="tabpanel">
					<Component :is="activeChild.is" v-bind="activeChild.props" />
				</div>
			</div>
		</template>

		<div v-else-if="children.length" class="blf-container-list">
			<Component v-for="child in children" :is="child.is" :key="child.props.id" v-bind="child.props" />
		</div>
		<div v-else class="blf-empty-state">{{ $t(`filter.noFilter.content`) }}</div>
	</section>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';

import type { FormNode, ImplicitContainerComponentProps } from '../model/types';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<ImplicitContainerComponentProps>();
const { runtime, presentation, activeChild, activeChildId } = containerRendererSetup(props);
const isTabbed = computed(() => !!(presentation.value.tabs || presentation.value['small-tabs']));
const isSmallTabs = computed(() => !!presentation.value['small-tabs']);
const containerClasses = computed(() => ['blf-container', presentation.value, props.class]);

function resolveTitle(node: FormNode) {
	return node.title ? toValue(node.title) : node.id;
}
function getSummariesForNode(nodeId: string) {
	return runtime.compile(nodeId).summaries;
}
const activeSummaryCounts = computed<Record<string, number>>(() =>
	Object.fromEntries(props.children.map(child => [child.props.id, getSummariesForNode(child.props.id).filter(summary => summary.value).length])),
);
</script>

<style lang="scss" scoped>
.blf-empty-state {
	color: var(--blf-text-muted);
	font-style: italic;
}
</style>
