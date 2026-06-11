import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';

export default function containerRendererSetup(props: ImplicitContainerComponentProps) {
	const runtime = useFormSystemRuntime();

	const presentation = computed(() => decodeVariants(props.variant));
	const childrenById = computed(() =>
		props.children.reduce<Record<string, (typeof props)['children'][number]>>((acc, child) => {
			acc[child.props.id] = child;
			return acc;
		}, {}),
	);

	const activeChildId = computed({
		get(): string | null {
			return runtime.state.uiState.value[props.id] ?? props.children[0]?.props.id ?? null;
		},
		set(value: string) {
			const child = childrenById.value[value];
			if (!child) {
				console.warn(`Attempted to activate child with id ${value} in container ${props.id}, but no such child exists.`);
				return;
			}

			runtime.state.uiState.value[props.id] = value;
		},
	});

	const activeChild = computed(() => (activeChildId.value ? childrenById.value[activeChildId.value] : null));

	return {
		runtime,
		presentation,
		activeChildId,
		activeChild,
		activeTab: activeChildId,
	};
}
