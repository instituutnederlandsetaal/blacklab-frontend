import { shallowReactive } from 'vue';

import { createRenderedNodeProps } from '@/features/form/model/field-component-props';
import type { FormRuntimeContext, FormNode } from '@/features/form/model/types';
import type { AnyVueComponent } from '@/types/helpers';

import useUid from '@/shared/utils/uid';

import ContainerRenderer from './ContainerRenderer.vue';

export type RenderableFormNode = {
	is: AnyVueComponent;
	props: Record<string, unknown>;
};

type FormRenderingRuntime = {
	context: FormRuntimeContext;
	state: {
		rawOverrides: { value: Record<string, string | null | undefined> };
		state: { value: Record<string, unknown> };
	};
};

function createMutableRuntimeProps(source: object, omittedKeys: readonly string[]): Record<string, unknown> {
	return createRenderedNodeProps(source, omittedKeys) as Record<string, unknown>;
}

/** Convert declarative form nodes into the component/props descriptors consumed by FormSystem. */
export function renderFormNode(node: FormNode, runtime: FormRenderingRuntime): RenderableFormNode {
	const idSuffix = useUid();
	const fieldRuntimeProps = {
		get disabled() {
			if (node.kind !== 'field') return false;
			const affects = node.controller.affectsBlackLabParameters;
			const parameters = typeof affects === 'function' ? affects(node, runtime.context) : affects;
			return parameters.some(parameter => runtime.state.rawOverrides.value[parameter] !== undefined);
		},
		htmlId: `${node.id}_${idSuffix}`,
	};

	if (node.kind === 'container' || node.kind === 'form') {
		const props = createMutableRuntimeProps(node, ['addChildren', 'component', 'children']);
		props.children = node.children.map(child => renderFormNode(child, runtime));
		return {
			is: node.component ?? ContainerRenderer,
			props: shallowReactive(props),
		};
	}

	if (node.kind === 'field') {
		const props = createMutableRuntimeProps(node, ['component', 'controller', 'kind']);
		Object.defineProperties(props, Object.getOwnPropertyDescriptors(fieldRuntimeProps));
		Object.defineProperties(props, {
			modelValue: {
				enumerable: true,
				get() {
					return runtime.state.state.value[node.id];
				},
			},
			'onUpdate:modelValue': {
				enumerable: true,
				value: (value: unknown) => {
					runtime.state.state.value[node.id] = value;
				},
			},
		});
		return {
			is: node.component,
			props: shallowReactive(props),
		};
	}

	return {
		is: node.component,
		props: shallowReactive(createMutableRuntimeProps(node, ['component', 'kind'])),
	};
}
