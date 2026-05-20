import type { } from // CompiledQuery,

	// DraftFormState,
	// FieldController,
	// FormFieldNode,
	// FormState,
	// FormSystemDefinition,
	// FormTreeNode,
	// ParentFormRuntime,
	// CompilableQuery,
	// FormBoundaryNode,
	// SubmittedFormSnapshot,
	'./types';

import { getAllFields, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormControllerStates, FormState, FormSystemDefinition } from '@/features/form/model/types/form-state';


// export function createDraftFormState(definition: FormSystemDefinition): DraftFormState {
// 	const forms = findForms(definition.root);
// 	const firstForm = forms[0]?.id ?? '';
// 	return {
// 		activeForm: firstForm,
// 		forms: Object.fromEntries(forms.map(form => [form.id, createInitialFormState(form, definition)])),
// 	};
// }

/** Create the state container for a form system */
export function createFormState(definition: FormSystemDefinition, context: FormRuntimeContext): FormState {
	return {
		controllerState: createInitialFormFieldStates(definition, context),
		uiState: {
			activeContainers: createInitialContainerUiStates(definition),
		},
	};
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

// export function createSubmittedSnapshot(definition: FormSystemDefinition, draftState: DraftFormState, formId = draftState.activeForm): SubmittedFormSnapshot | null {
// 	const form = findForm(definition.root, formId);
// 	if (!form) return null;
// 	const state = cloneFormState(draftState.forms[form.id] ?? createInitialFormState(form, definition));
// 	const compiled = buildForm(definition, form, state);
// 	return {
// 		form: form.id,
// 		state,
// 		compiled,
// 		schemaVersion: definition.schemaVersion,
// 	};
// }

// export function cloneDraftState(state: DraftFormState): DraftFormState {
// 	return cloneStateValue(state);
// }

// export function cloneFormState(state: FormState): FormState {
// 	return cloneStateValue(state);
// }

// export function cloneStateValue<T>(value: T): T {
// 	return structuredClone(toRaw(value));
// }

// export function setControllerState(draftState: DraftFormState, formId: string, stateKey: string, value: unknown): DraftFormState {
// 	const next = cloneDraftState(draftState);
// 	const form = next.forms[formId];
// 	if (form) form.controllerState[stateKey] = value;
// 	return next;
// }

// export function setActiveContainer(draftState: DraftFormState, formId: string, containerId: string, childId: string | null): DraftFormState {
// 	const next = cloneDraftState(draftState);
// 	const form = next.forms[formId];
// 	if (form) form.uiState.activeContainers[containerId] = childId;
// 	return next;
// }

// export function setActiveForm(draftState: DraftFormState, formId: string): DraftFormState {
// 	return {
// 		...cloneDraftState(draftState),
// 		activeForm: formId,
// 	};
// }

// export function resetFormState(definition: FormSystemDefinition, draftState: DraftFormState, formId: string): DraftFormState {
// 	const form = findForm(definition.root, formId);
// 	if (!form) return draftState;
// 	const next = cloneDraftState(draftState);
// 	next.forms[formId] = createInitialFormState(form, definition);
// 	return next;
// }

// export function findForms(root: FormTreeNode): FormBoundaryNode[] {
// 	if (root.kind === 'form') return [root];
// 	if (root.kind !== 'container') return [];
// 	return root.children.flatMap(findForms);
// }

// export function findForm(root: FormTreeNode, formId: string): FormBoundaryNode | null {
// 	return findForms(root).find(form => form.id === formId) ?? null;
// }

// export function getStateKey(node: FormFieldNode): string {
// 	return node.stateKey ?? node.id;
// }
