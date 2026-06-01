import { computed } from 'vue';

import { useFormSystemRuntime } from '@/features/form/model/runtime';
import { getVariantClassNames } from '@/features/form/model/form-utils';
import type { FormContainerLikeNode, FormNode } from '@/features/form/model/types/form-shape';

export default function containerRendererSetup(props: { node: FormContainerLikeNode }) {
	const runtime = useFormSystemRuntime();

	const isTabbed = computed(() => props.node.variant === 'tabs' || props.node.variant === 'small-tabs');
	const isSmallTabs = computed(() => props.node.variant === 'small-tabs');
	const childrenById = computed(() => Object.fromEntries(props.node.children.map(child => [child.id, child])));
	const presentationVariant = computed(() => props.node.variant ?? 'list');

	const activeChild = computed<FormNode | null>(() => {
		const activeChildId = runtime.state.value.uiState.activeContainers[props.node.id] ?? null;
		return activeChildId ? childrenById.value[activeChildId] : null;
	});

	const containerClasses = computed(() => [
		'blf-container',
		props.node.kind === 'form' ? 'blf-form' : null,
		...getVariantClassNames(props.node.variant, 'blf-container'),
		`presentation-${presentationVariant.value}`,
		props.node.class,
	]);

	function activateChild(childId: string) {
		const child = childrenById.value[childId];
		if (!child) return;
		runtime.state.value.uiState.activeContainers[props.node.id] = childId;
		if (child.kind === 'form') {
			runtime.activeFormNode.value = child;
		}
	}

	return {
		runtime,
		isTabbed,
		isSmallTabs,
		activeChild,
		containerClasses,
		activateChild,
	};
}
