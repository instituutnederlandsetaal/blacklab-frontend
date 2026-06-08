/**
 * Contains the state/store that backs the form system.
 */

import type { Ref } from 'vue';

import type { BlackLabParameter, BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry, CompiledFormState, CompiledFormStateWithSummaries } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormContainerLikeNode, FormNode } from '@/features/form/model/types/form-shape';

export type ControllerState = unknown;
export type FormControllerStates = Record<string, ControllerState>;

/** The root state of a form stack */
export type FormState = {
	/**
	 * For every controller in the form system, contains its state.
	 * If multiple containers/inner forms contain the same controller, they will share the state.
	 */
	controllerState: FormControllerStates;
	/**
	 * For every container-like node in the form system, contains which child is active (if any).
	 * Used to manage tabs.
	 */
	uiState: {
		activeContainers: Record<string, string | null>;
	};
	rawOverrides: BlackLabParameters;
};

export type FormSystemDefinition = {
	/** The tree/structure of the form system */
	root: FormContainerLikeNode;
};

export type UseParentFormReturn = {
	formId: string;
	formState: FormState;
	summaries: SummaryEntry[];
	compiled: CompiledFormState;
	corpus: FormRuntimeContext['corpus'];
	getNode(nodeId: string): FormNode | undefined;
	getSummariesForNode(nodeId: string): SummaryEntry[];
};

export type FormSystemRuntime = {
	definition: FormSystemDefinition;
	context: FormRuntimeContext;

	state: Ref<FormState>;
	forms: Record<string, FormBoundaryNode>;

	compile(formId: string): CompiledFormStateWithSummaries;
	submit(formId: string): CompiledFormStateWithSummaries;
	onSubmit(callback: (formId: string, submitted: CompiledFormStateWithSummaries) => void): void;
	onReset(callback: () => void): void;
	replaceState(state: FormState): void;
	reset(): void;
	clearRawOverride(parameter: BlackLabParameter): void;
	shutdown(): void;
};
