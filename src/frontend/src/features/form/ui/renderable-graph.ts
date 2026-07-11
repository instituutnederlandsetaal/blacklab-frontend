import { computed, markRaw, reactive, toRefs, type Ref, type ToRefs } from 'vue';

import { decodeVariants, isContainerNode } from '@/features/form/model/form-utils';
import type { FormRuntimeContext, FormNode, ImplicitContainerComponentProps } from '@/features/form/model/types';
import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
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
		rawOverrides: Ref<Partial<Record<BlackLabParameter, string | null | undefined>>>;
		getVModel(id: string): { modelValue: Ref<unknown>; 'onUpdate:modelValue': (value: unknown) => void };
	};
};

function toRefsWithout<T extends object>(value: T, ...omittedKeys: readonly (keyof T)[]): Omit<ToRefs<T>, (typeof omittedKeys)[number]> {
	const refs = toRefs(value);
	for (const key of omittedKeys) delete refs[key];
	return refs;
}

function isTabbed(variant: ImplicitContainerComponentProps['variant']): boolean {
	const presentation = decodeVariants(variant);
	return !!(presentation.tabs || presentation['small-tabs']);
}

/** Convert declarative form nodes into the component/props descriptors consumed by FormSystem. */
export function renderFormNode(node: FormNode, parentNode: FormNode | null, runtime: FormRenderingRuntime): RenderableFormNode {
	const idSuffix = useUid();
	const fieldRuntimeProps = {
		disabled: computed(() => {
			if (node.kind !== 'field') return false;
			const affects = node.controller.affectsBlackLabParameters;
			const parameters = typeof affects === 'function' ? affects(node, runtime.context) : affects;
			return parameters.some(parameter => runtime.state.rawOverrides.value[parameter] !== undefined);
		}),
		htmlId: computed(() => `${node.id}_${idSuffix}`),
	} satisfies Record<string, Ref<unknown>>;

	if (node.kind === 'container' || node.kind === 'form') {
		return {
			is: markRaw(node.component ?? ContainerRenderer),
			props: reactive({
				...toRefsWithout(node, 'component'),
				hideTitle: computed(() => isContainerNode(parentNode) && isTabbed(parentNode.variant)),
				children: computed(() => node.children.map(child => renderFormNode(child, node, runtime))),
			}),
		};
	}

	if (node.kind === 'field') {
		return {
			is: markRaw(node.component),
			props: reactive({
				...toRefsWithout(node, 'kind', 'component', 'controller'),
				...fieldRuntimeProps,
				...runtime.state.getVModel(node.id),
			}),
		};
	}

	return {
		is: markRaw(node.component),
		props: reactive({
			...toRefsWithout(node, 'kind', 'component'),
		}),
	};
}
