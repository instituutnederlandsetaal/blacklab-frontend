/**
 * Contains the state/store that backs the form system.
 */

import type { Ref } from 'vue';

import type { BlackLabParameter, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry, CompiledFormState, PersistableSubmittableFormState, PersistableFormState } from '@/features/form/model/types/form-query';
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
	rawOverrides: Partial<Record<BlackLabParameter, string | null>>;
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

// what should the form hold

export type FormSystemRuntime = {
	definition: FormSystemDefinition;
	context: FormRuntimeContext;

	state: Ref<FormState>;
	forms: Record<string, FormBoundaryNode>;

	compile(formId: string): CompiledFormState;
	onCompile(callback: (formId: string, compiled: CompiledFormState) => void): void;
	submit(formId: string): PersistableSubmittableFormState;
	onSubmit(callback: (formId: string, submitted: PersistableSubmittableFormState) => void): void;
	onReset(callback: () => void): void;
	summarize(formId: string): SummaryEntry[];
	onSummarize(callback: (formId: string, summaries: SummaryEntry[]) => void): void;
	persist(formId: string): PersistableFormState;
	onPersist(callback: (formId: string, persisted: PersistableFormState) => void): void;
	replaceState(state: FormState): void;
	reset(): void;
	clearRawOverride(parameter: BlackLabParameter): void;
};
