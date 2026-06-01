import { h, type Component } from 'vue';

import type { FormNode } from '@/features/form/model/types/form-shape';
import type { FormSystemRuntime } from '@/features/form/model/types/form-state';

import ContainerRenderer from './ContainerRenderer.vue';

export function resolveNodeComponent(node: FormNode): Component {
	if (node.kind === 'container') {
		return node.component ?? ContainerRenderer;
	} else if (node.kind === 'form') {
		return node.component ?? ContainerRenderer; // Forms use the same renderer as containers, but with some different behavior. This is handled internally in the renderer based on the node kind.
	} else if (node.kind === 'field') {
		return node.component;
	} else if (node.kind === 'view') {
		return node.component;
	}
	return {
		render: () => h('div', {}, `Unknown node kind: ${(node as any).kind}`),
	};
}

type NodeRenderContext = {
	hideTitle?: boolean;
	runtime: FormSystemRuntime;
	scopeId: string;
};

export function getNodeProps(node: FormNode, { hideTitle = false, runtime, scopeId }: NodeRenderContext) {
	if (node.kind === 'container' || node.kind === 'form') {
		return hideTitle ? { hideTitle, node } : { node };
	} else if (node.kind === 'field') {
		return {
			...node,
			htmlId: `${node.id}_${scopeId}`,
			modelValue: runtime.state.value.controllerState[node.id],
			'onUpdate:modelValue': (value: unknown) => {
				runtime.state.value.controllerState[node.id] = value;
			},
		};
	} else if (node.kind === 'view') {
		return node;
	}

	return {};
}
