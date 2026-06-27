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
 * For every field in the form, create its initial state using its controller's createDefaultState function, and return an object containing all field states.
 *
 * @param rootNode the root
 * @param context
 * @returns
 */

function createInitialControllerStates(rootNode: FormNode, context: FormRuntimeContext): Record<string, unknown> {
	const states: Record<string, unknown> = {};
	for (const field of walkFormNodes(rootNode, 'field')) {
		const initialState = field.controller.createDefaultState(field, context);
		states[field.id] = initialState;
	}
	return states;
}

/**
 * For every container-like node in the form, find its first child (if any) and set that as the current active child.
 * This is used to set up the initial ui state of the form, so that tabs and similar container types will have an active child by default.
 *
 * @param definition the form graph
 * @returns the container ui map
 */
function createInitialUiStates(rootNode: FormNode): Record<string, string | null> {
	const activeContainers: Record<string, string | null> = {};
	for (const node of walkFormNodes(rootNode)) {
		if (isContainerNode(node)) {
			const firstChild = node.children[0];
			if (firstChild) activeContainers[node.id] = firstChild.id;
		}
	}
	return activeContainers;
}

export function createDefaultFormState(form: FormNode, context: FormRuntimeContext): NewFormState {
	return {
		state: createInitialControllerStates(form, context),
		uiState: createInitialUiStates(form),
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

	function addNodeToState(node: AnyBaseFormNode): void {
		if (isFieldNode(node)) state.value[node.id] = node.controller.createDefaultState(node, {} as any);
		else if (isContainerNode(node)) uiState.value[node.id] = null;
	}

	function activateDefaultChild(containerId: string, childId: string): void {
		if (uiState.value[containerId] == null) {
			uiState.value[containerId] = childId;
		}
	}

	function getRawState(): NewFormState {
		return {
			state: toRaw(state.value),
			uiState: toRaw(uiState.value),
			rawOverrides: toRaw(rawOverrides.value),
		};
	}

	function getReactiveState(): NewFormState {
		return reactive({ state, uiState, rawOverrides });
	}

	function reset(form: FormNode, context: FormRuntimeContext) {
		state.value = createInitialControllerStates(form, context);
		uiState.value = createInitialUiStates(form);
		rawOverrides.value = {};
	}

	return {
		replaceState,
		getRawState,
		getVModel,
		addNodeToState,
		activateDefaultChild,
		reset,
		getReactiveState,
		state,
		uiState,
		rawOverrides,
	};
}
