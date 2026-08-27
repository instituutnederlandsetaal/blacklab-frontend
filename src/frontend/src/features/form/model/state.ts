import { ref, toRaw } from 'vue';

import { isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormNode } from '@/features/form/model/types';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';

export type FormOverrides = Record<string, unknown>;

export type NewFormState = {
	state: Record<string, unknown>;
	uiState: Record<string, string | null>;
	rawOverrides: FormOverrides;
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

export function createDefaultFormState(context: FormRuntimeContext, ...rootNodes: FormNode[]): NewFormState {
	return {
		state: createInitialControllerStates(context, ...rootNodes),
		uiState: createInitialUiStates(...rootNodes),
		rawOverrides: {},
	};
}

export default function createFormState(initialState?: NewFormState) {
	const state = ref<Record<string, unknown>>(structuredClone(toRaw(initialState?.state ?? {})));
	const uiState = ref<Record<string, string | null>>(structuredClone(toRaw(initialState?.uiState ?? {})));
	const rawOverrides = ref<FormOverrides>(structuredClone(toRaw(initialState?.rawOverrides ?? {})));

	function replaceState(newState: NewFormState): void {
		state.value = structuredClone(toRaw(newState.state));
		uiState.value = structuredClone(toRaw(newState.uiState));
		rawOverrides.value = structuredClone(toRaw(newState.rawOverrides));
	}

	function getRawState(): NewFormState {
		return {
			state: structuredClone(toRaw(state.value)),
			uiState: structuredClone(toRaw(uiState.value)),
			rawOverrides: structuredClone(toRaw(rawOverrides.value)),
		};
	}

	function getReactiveState(): NewFormState {
		return {
			state: state.value,
			uiState: uiState.value,
			rawOverrides: rawOverrides.value,
		};
	}

	return {
		replaceState,
		getRawState,
		getReactiveState,
		state,
		uiState,
		rawOverrides,
	};
}
