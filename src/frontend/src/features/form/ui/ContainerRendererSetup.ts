import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';

export default function containerRendererSetup(props: ImplicitContainerComponentProps) {
	const runtime = useFormSystemRuntime();

	const presentation = computed(() => decodeVariants(props.variant));
	const childrenById = computed(() => Object.fromEntries(props.children.map(child => [child.id, child])));

	const activeChildId = computed({
		get(): string | null {
			return runtime.state.value.uiState.activeContainers[props.id] ?? props.children[0]?.id ?? null;
		},
		set(value: string) {
			const child = childrenById.value[value];
			if (!child) {
				console.warn(`Attempted to activate child with id ${value} in container ${props.id}, but no such child exists.`);
				return;
			}

			if (child.kind === 'form') {
				runtime.activeFormNode.value = child;
			}
			runtime.state.value.uiState.activeContainers[props.id] = value;
		},
	});

	const activeChild = computed<FormNode | null>(() => (activeChildId.value ? childrenById.value[activeChildId.value] : null));

	return {
		runtime,
		presentation,
		activeChildId,
		activeChild,
		activeTab: activeChildId,
	};
}
