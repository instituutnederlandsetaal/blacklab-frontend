<template>
	<section :class="containerClasses">
		<header v-if="title && !hideTitle" class="blf-container-title">{{ title }}</header>

		<template v-if="isTabbed">
			<ul :class="['nav', 'nav-tabs', { 'nav-tabs-small': isSmallTabs }]" role="tablist">
				<li v-for="child in children" :key="child.id" :class="{ active: activeChildId === child.id }" role="presentation">
					<a href="#" role="tab" :aria-selected="activeChildId === child.id" @click.prevent="activeChildId = child.id">
						{{ resolveTitle(child) }}
						<span v-if="activeSummaryCounts[child.id]" class="badge">{{ activeSummaryCounts[child.id] }}</span>
					</a>
				</li>
			</ul>
			<div class="tab-content">
				<div v-if="activeChild" class="tab-pane active" role="tabpanel">
					<Component :is="resolveNodeComponent(activeChild)" :key="activeChild.id" v-bind="nodeProps(activeChild, true)" />
				</div>
			</div>
		</template>

		<div v-else-if="children.length" class="blf-container-list">
			<Component v-for="child in children" :is="resolveNodeComponent(child)" :key="child.id" v-bind="nodeProps(child)" />
		</div>
		<div v-else class="blf-empty-state">{{ $t(`filter.noFilter.content`) }}</div>
	</section>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import { useParentForm } from '@/features/form/model/runtime';
import type { FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';
import containerRendererSetup from '@/features/form/ui/ContainerRendererSetup';
import { getNodeProps, resolveNodeComponent } from '@/features/form/ui/node-render';

import useUid from '@/shared/utils/useUid';

defineOptions({ name: 'ContainerRendererFilters' });

const props = defineProps<ImplicitContainerComponentProps>();
const { runtime, presentation, activeChild, activeChildId } = containerRendererSetup(props);
const parentForm = useParentForm();
const renderScopeId = useUid();
const isTabbed = computed(() => !!(presentation.value.tabs || presentation.value['small-tabs']));
const isSmallTabs = computed(() => !!presentation.value['small-tabs']);
const containerClasses = computed(() => ['blf-container', presentation.value, props.class]);

function nodeProps(node: FormNode, hideTitle = false) {
	return getNodeProps(node, {
		hideTitle,
		runtime,
		scopeId: renderScopeId,
	});
}

function resolveTitle(node: FormNode) {
	return node.title ? toValue(node.title) : node.id;
}

const activeSummaryCounts = computed<Record<string, number>>(() =>
	Object.fromEntries(props.children.map(child => [child.id, parentForm.getSummariesForNode(child.id).filter(summary => summary.value).length])),
);
</script>

<style lang="scss" scoped>
.blf-empty-state {
	color: var(--blf-text-muted);
	font-style: italic;
}
</style>
