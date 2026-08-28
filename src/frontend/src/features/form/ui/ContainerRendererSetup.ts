import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { ImplicitContainerComponentProps } from '@/features/form/model/types/form-shape';

export default function containerRendererSetup(props: ImplicitContainerComponentProps) {
	const runtime = useFormSystemRuntime();

	const presentation = computed(() => decodeVariants(props.variant));

	const activeChildId = computed({
		get(): string | null {
			return runtime.value.state.uiState.value[props.id] ?? props.children[0]?.props.id ?? null;
		},
		set(value: string) {
			runtime.value.state.uiState.value[props.id] = value;
		},
	});

	const activeChild = computed(() => props.children.find(child => child.props.id === activeChildId.value) ?? null);

	return {
		runtime,
		presentation,
		activeChildId,
		activeChild,
	};
}
