<template>
	<section :class="containerClasses">
		<header v-if="resolvedTitle && !hideTitle" class="blf-container-title">{{ resolvedTitle }}</header>

		<template v-if="isTabbed">
			<ul :class="['nav', 'nav-tabs', { 'nav-tabs-small': isSmallTabs }]" role="tablist">
				<li v-for="(child, index) in children" :key="child.props.id" :class="{ active: activeChildId === child.props.id }" role="presentation">
					<a
						:id="tabId(props.id, child.props.id)"
						href="#"
						role="tab"
						:aria-controls="tabPanelId(props.id, child.props.id)"
						:aria-selected="activeChildId === child.props.id"
						:tabindex="activeChildId === child.props.id ? 0 : -1"
						@click.prevent="activeChildId = child.props.id"
						@keydown="handleTabKeydown($event, index, props.children, props.id, id => (activeChildId = id))"
					>
						{{ resolveNodeTitle(child.props) }}
						<span v-if="activeSummaryCounts[child.props.id]" class="badge">{{ activeSummaryCounts[child.props.id] }}</span>
					</a>
				</li>
			</ul>
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
import { handleTabKeydown, resolveNodeTitle, tabId, tabPanelId } from '@/features/form/ui/tab-utils';

import type { ImplicitContainerComponentProps } from '../model/types';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<ImplicitContainerComponentProps>();
const { runtime, presentation, activeChild, activeChildId } = containerRendererSetup(props);
const isTabbed = computed(() => !!(presentation.value.tabs || presentation.value['small-tabs']));
const isSmallTabs = computed(() => !!presentation.value['small-tabs']);
const containerClasses = computed(() => ['blf-container', presentation.value, props.class]);
const resolvedTitle = computed(() => (props.title ? toValue(props.title) : ''));

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
