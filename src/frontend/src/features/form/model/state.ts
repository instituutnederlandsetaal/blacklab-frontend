import { toRaw, computed, ref, reactive } from 'vue';

import { isContainerNode, isFieldNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormNode, AnyBaseFormNode } from '@/features/form/model/types';
import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';

export type NewFormState = {
	state: Record<string, unknown>;
	uiState: Record<string, string | null>;
	rawOverrides: BlackLabParameters;
};

/**
 * Walk all nodes, look for field nodes, and create initial states for them using their controller's createDefaultState function, and return an object containing all field states.
 *
 * @param rootNode the root
 * @param context
 * @returns
 */
function createInitialControllerStates(context: FormRuntimeContext, ...rootNodes: FormNode[]): Record<string, unknown> {
	const states: Record<string, unknown> = {};
	for (const field of walkFormNodes(rootNodes, 'field')) {
		const initialState = field.controller.createDefaultState(field, context);
		states[field.id] = initialState;
	}
	return states;
}

/**
 * Walk all nodes, look for container nodes, and create initial ui states for them by setting their active child to the first child in their children array (if any),
 * so that tabs and similar container types will have an active child by default.
 *
 * @param definition the form graph
 * @returns the container ui map
 */
function createInitialUiStates(...rootNodes: FormNode[]): Record<string, string | null> {
	const activeContainers: Record<string, string | null> = {};
	for (const node of walkFormNodes(rootNodes).filter(isContainerNode)) {
		const firstChild = node.children[0];
		if (firstChild) activeContainers[node.id] = firstChild.id;
	}
	return activeContainers;
}

export function createDefaultFormState(context: FormRuntimeContext, ...rootNodes: FormNode[]): NewFormState;
/** @deprecated Use createDefaultFormState(context, ...rootNodes). */
export function createDefaultFormState(rootNode: FormNode, context: FormRuntimeContext, ...rootNodes: FormNode[]): NewFormState;
export function createDefaultFormState(first: FormRuntimeContext | FormNode, ...rest: Array<FormRuntimeContext | FormNode>): NewFormState {
	const context = ('corpus' in first ? first : rest.shift()) as FormRuntimeContext;
	const rootNodes = ('corpus' in first ? rest : [first, ...rest]) as FormNode[];
	return {
		state: createInitialControllerStates(context, ...rootNodes),
		uiState: createInitialUiStates(...rootNodes),
		rawOverrides: {},
	};
}

export default function createFormState() {
	const state = ref<Record<string, unknown>>({});
	const uiState = ref<Record<string, string | null>>({});
	const rawOverrides = ref<BlackLabParameters>({});

	function replaceState(newState: NewFormState): void {
		state.value = structuredClone(toRaw(newState.state));
		uiState.value = structuredClone(toRaw(newState.uiState));
		rawOverrides.value = structuredClone(toRaw(newState.rawOverrides));
	}

	function getVModel(id: string) {
		return {
			modelValue: computed(() => state.value[id]),
			'onUpdate:modelValue': (value: unknown) => {
				state.value[id] = value;
			},
		};
	}

	function addNodeToState(node: AnyBaseFormNode, context: FormRuntimeContext): void {
		if (isFieldNode(node)) state.value[node.id] = node.controller.createDefaultState(node, context);
		else if (isContainerNode(node)) uiState.value[node.id] = null;
	}

	function activateDefaultChild(containerId: string, childId: string): void {
		if (uiState.value[containerId] == null) {
			uiState.value[containerId] = childId;
		}
	}

	function getRawState(): NewFormState {
		return {
			state: structuredClone(toRaw(state.value)),
			uiState: structuredClone(toRaw(uiState.value)),
			rawOverrides: structuredClone(toRaw(rawOverrides.value)),
		};
	}

	function getReactiveState(): NewFormState {
		return reactive({ state, uiState, rawOverrides });
	}

	return {
		replaceState,
		getRawState,
		getVModel,
		addNodeToState,
		activateDefaultChild,
		getReactiveState,
		state,
		uiState,
		rawOverrides,
	};
}
