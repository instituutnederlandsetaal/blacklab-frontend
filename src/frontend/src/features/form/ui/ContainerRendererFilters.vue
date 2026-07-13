<template>
	<section :class="containerClasses">
		<header v-if="resolvedTitle && !hideTitle" class="blf-container-title">{{ resolvedTitle }}</header>

		<template v-if="isTabbed">
			<Tabs v-model="activeChildId" :tabs="tabs" :small="isSmallTabs" :aria-label="resolvedTitle || 'Filter sections'">
				<template #label="{ tab }">
					{{ tab.label }}
					<span v-if="activeSummaryCounts[tab.value]" class="badge">{{ activeSummaryCounts[tab.value] }}</span>
				</template>
			</Tabs>
			<div class="tab-content">
				<div v-if="activeChild" :id="tabPanelId(props.id, activeChild.props.id)" class="tab-pane active" role="tabpanel" :aria-labelledby="tabId(props.id, activeChild.props.id)">
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
import { createTabs, tabId, tabPanelId } from '@/features/form/ui/tab-utils';
import Tabs from '@/shared/ui/Tabs.vue';

import type { ImplicitContainerComponentProps } from '../model/types';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<ImplicitContainerComponentProps>();
const { runtime, presentation, activeChild, activeChildId } = containerRendererSetup(props);
const isTabbed = computed(() => !!(presentation.value.tabs || presentation.value['small-tabs']));
const isSmallTabs = computed(() => !!presentation.value['small-tabs']);
const containerClasses = computed(() => ['blf-container', presentation.value, props.class]);
const resolvedTitle = computed(() => (props.title ? toValue(props.title) : ''));
const tabs = computed(() => createTabs(props.id, props.children));

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
