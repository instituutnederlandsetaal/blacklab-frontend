import { computed } from 'vue';

import { isContainerNode } from '@/features/form/model/form-utils';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { ContainerNodeConfig, FormContainerNode, FormNode } from '@/features/form/model/types/form-shape';

export default function containerRendererSetup<Config extends ContainerNodeConfig>(props: { node: FormContainerNode<Config> }) {
	const runtime = useFormSystemRuntime();

	const isTabbed = computed(() => props.node.config?.variant === 'tabs' || props.node.config?.variant === 'small-tabs');
	const childrenById = computed(() => Object.fromEntries(props.node.children.map(child => [child.id, child])));

	const activeChild = computed<FormNode | null>(() => {
		const activeChildId = runtime.state.value.uiState.activeContainers[props.node.id] ?? null;
		return activeChildId ? childrenById.value[activeChildId] : null;
	});

	const containerClasses = computed(() => ['blf-container', `presentation-${props.node.config?.variant || 'list'}`, props.node.class]);

	function activateChildContainer(childId: string) {
		const child = childrenById.value[childId];
		if (isContainerNode(child)) {
			runtime.state.value.uiState.activeContainers[props.node.id] = childId;
		}
		if (child.kind === 'form') {
			runtime.activeFormNode.value = child;
		}
	}

	return {
		runtime,
		isTabbed,
		activeChild,
		containerClasses,
		activateChildContainer,
	};
}
