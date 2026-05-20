import { toRaw } from 'vue';

import { getAllFields, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormControllerStates, FormState, FormSystemDefinition } from '@/features/form/model/types/form-state';

/** Create the state container for a form system */
export function createFormState(definition: FormSystemDefinition, context: FormRuntimeContext): FormState {
	return {
		controllerState: createInitialFormFieldStates(definition, context),
		uiState: {
			activeContainers: createInitialContainerUiStates(definition),
		},
	};
}

export function cloneFormState(state: FormState): FormState {
	return structuredClone(toRaw(state));
}

/**
 * For every field in the form, create its initial state using its controller's createDefaultState function, and return an object containing all field states.
 *
 * @param definition
 * @param context
 * @returns
 */
export function createInitialFormFieldStates(definition: FormSystemDefinition, context: FormRuntimeContext): FormControllerStates {
	const states: FormControllerStates = {};
	for (const field of getAllFields(definition.root)) {
		const initialState = field.controller.createDefaultState(field, context);
		states[field.id] = initialState;
	}
	return states;
}

/**
 * For every container in the form, find its first child container (if any) and set that as the current active child.
 * This is used to set up the initial ui state of the form, so that tabs and similar container types will have an active child by default.
 *
 * @param definition the form graph
 * @returns the container ui map
 */
export function createInitialContainerUiStates(definition: FormSystemDefinition): Record<string, string | null> {
	const activeContainers: Record<string, string | null> = {};
	for (const node of walkFormNodes(definition.root)) {
		if (isContainerNode(node)) {
			const containerId = node.id;
			const firstChildContainer = node.children.find(isContainerNode);
			if (firstChildContainer) activeContainers[containerId] = firstChildContainer.id;
		}
	}
	return activeContainers;
}
