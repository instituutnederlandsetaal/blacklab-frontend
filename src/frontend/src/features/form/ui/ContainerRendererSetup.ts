import { computed } from 'vue';

import { useFormSystemRuntime } from '@/features/form/model/runtime';
import { decodeVariants } from '@/features/form/model/form-utils';
import type { FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';

export default function containerRendererSetup(props: ImplicitContainerComponentProps) {
	const runtime = useFormSystemRuntime();

	const presentation = computed(() => decodeVariants(props.variant));
	const isTabbed = computed(() => !!(presentation.value.tabs || presentation.value['small-tabs']));
	const isSmallTabs = computed(() => !!presentation.value['small-tabs']);
	const childrenById = computed(() => Object.fromEntries(props.children.map(child => [child.id, child])));

	const activeChild = computed<FormNode | null>(() => {
		const activeChildId = runtime.state.value.uiState.activeContainers[props.id] ?? null;
		return activeChildId ? childrenById.value[activeChildId] : null;
	});

	const containerClasses = computed(() => [
		'blf-container',
		props.kind === 'form' ? 'blf-form' : null,
		presentation.value,
		props.class,
	]);

	function activateChild(childId: string) {
		const child = childrenById.value[childId];
		if (!child) return;
		runtime.state.value.uiState.activeContainers[props.id] = childId;
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
