/**
 * Contains the state/store that backs the form system.
 */

import type { Ref } from 'vue';

import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry, CompiledFormState, PersistableSubmittableFormState, PersistableFormState } from '@/features/form/model/types/form-query';
import type { FormContainerNode, FormBoundaryNode } from '@/features/form/model/types/form-shape';

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
	 * For every container in the form system, contains which child-container is active (if any).
	 * Used to manage tabs..
	 */
	uiState: {
		activeContainers: Record<string, string | null>;
	};
};

export type FormSystemDefinition = {
	/** Version, for schema compatibility when using history */
	schemaVersion: string;

	/** The tree/structure of the form system */
	root: FormContainerNode | FormBoundaryNode;
};

export type UseParentFormReturn = {
	formId: string;
	formState: FormState;
	summaries: SummaryEntry[];
	compiled: CompiledFormState;
	corpus: FormRuntimeContext['corpus'];
};

// what should the form hold

export type FormSystemRuntime = {
	definition: FormSystemDefinition;
	context: FormRuntimeContext;

	state: Ref<FormState>;
	activeFormNode: Ref<FormBoundaryNode | null>;
	forms: Record<string, FormBoundaryNode>;

	compile(formId: string): CompiledFormState;
	onCompile(callback: (formId: string, compiled: CompiledFormState) => void): void;
	submit(formId: string): PersistableSubmittableFormState;
	onSubmit(callback: (formId: string, submitted: PersistableSubmittableFormState) => void): void;
	summarize(formId: string): SummaryEntry[];
	onSummarize(callback: (formId: string, summaries: SummaryEntry[]) => void): void;
	persist(formId: string): PersistableFormState;
	onPersist(callback: (formId: string, persisted: PersistableFormState) => void): void;
	reset(): void;
};
