import { shallowReactive } from 'vue';

import { createRenderedNodeProps } from '@/features/form/model/field-component-props';
import type { FormNode } from '@/features/form/model/types';
import type { AnyVueComponent } from '@/types/helpers';

import useUid from '@/shared/utils/uid';

import ContainerRenderer from './ContainerRenderer.vue';
import FieldRenderer from './FieldRenderer.vue';

export type RenderableFormNode = {
	is: AnyVueComponent;
	props: Record<string, unknown>;
};

type FormRenderingRuntime = {
	state: {
		state: { value: Record<string, unknown> };
	};
};

function createMutableRuntimeProps(source: object, omittedKeys: readonly string[]): Record<string, unknown> {
	return createRenderedNodeProps(source, omittedKeys) as Record<string, unknown>;
}

/** Convert declarative form nodes into the component/props descriptors consumed by FormSystem. */
export function renderFormNode(node: FormNode, runtime: FormRenderingRuntime): RenderableFormNode {
	const idSuffix = useUid();

	if (node.kind === 'container' || node.kind === 'form') {
		const props = createMutableRuntimeProps(node, ['component', 'children']);
		props.children = node.children.map(child => renderFormNode(child, runtime));
		return {
			is: node.component ?? ContainerRenderer,
			props: shallowReactive(props),
		};
	}

	if (node.kind === 'field') {
		const props: Record<string, unknown> = {
			field: node,
			htmlId: `${node.id}_${idSuffix}`,
			get modelValue() {
				return runtime.state.state.value[node.id];
			},
			'onUpdate:modelValue': (value: unknown) => {
				runtime.state.state.value[node.id] = value;
			},
		};
		return {
			is: FieldRenderer,
			props: shallowReactive(props),
		};
	}

	return {
		is: node.component,
		props: shallowReactive(createMutableRuntimeProps(node, ['component', 'kind'])),
	};
}
