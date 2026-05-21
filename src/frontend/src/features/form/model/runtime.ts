import { computed, inject, provide, ref, shallowRef, toValue, watch, type ComputedRef, type InjectionKey, type MaybeRefOrGetter, type ShallowRef } from 'vue';

import { buildFormQuery, summarizeForm } from '@/features/form/model/compile';
import { createCompiledQueryProjections } from '@/features/form/model/compile/query-artifact';
import { getAllNodes, pickActiveFormState, reactivePickActiveFormState } from '@/features/form/model/form-utils';
import { cloneFormState, createFormState } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormState, PersistableFormState, PersistableSubmittableFormState, SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';
import type { FormState, FormSystemRuntime, FormSystemDefinition, UseParentFormReturn } from '@/features/form/model/types/form-state';

const formSystemRuntimeKey: InjectionKey<FormSystemRuntime> = Symbol('formSystemRuntime');

type ParentFormRuntime = {
	compiled: ComputedRef<CompiledFormState>;
	corpus: FormRuntimeContext['corpus'];
	formId: ComputedRef<string>;
	formState: ShallowRef<FormState>;
	summaries: ComputedRef<SummaryEntry[]>;
};

const parentFormRuntimeKey: InjectionKey<ParentFormRuntime> = Symbol('parentFormRuntime');

export function createParentFormRuntime(rootRuntime: FormSystemRuntime, formId: MaybeRefOrGetter<string>) {
	const currentFormId = computed(() => toValue(formId));
	const currentForm = computed(() => {
		const form = rootRuntime.forms[currentFormId.value];
		if (!form) throw new Error(`Form with id ${currentFormId.value} is not registered.`);
		return form;
	});
	const formState = shallowRef<FormState>(reactivePickActiveFormState(currentForm.value, rootRuntime.state.value));

	watch(
		currentForm,
		form => {
			formState.value = reactivePickActiveFormState(form, rootRuntime.state.value);
		},
		{ flush: 'sync' },
	);

	return {
		compiled: computed(() => rootRuntime.compile(currentFormId.value)),
		corpus: rootRuntime.context.corpus,
		formId: currentFormId,
		formState,
		summaries: computed(() => rootRuntime.summarize(currentFormId.value)),
	};
}

export function createFormSystemRuntime(definition: FormSystemDefinition, context: FormRuntimeContext, initialState?: FormState): FormSystemRuntime {
	const formsList = getAllNodes(definition.root, 'form');
	const formsById = Object.fromEntries(formsList.map(form => [form.id, form]));
	const activeFormNode = shallowRef<FormBoundaryNode | null>(formsList[0] ?? null);
	const state = ref(initialState ? cloneFormState(initialState) : createFormState(definition, context));

	const compileListeners: ((formId: string, compiled: CompiledFormState) => void)[] = [];
	const submitListeners: ((formId: string, submitted: PersistableSubmittableFormState) => void)[] = [];
	const summarizeListeners: ((formId: string, summaries: SummaryEntry[]) => void)[] = [];
	const persistListeners: ((formId: string, persisted: PersistableFormState) => void)[] = [];

	return {
		activeFormNode,
		definition,
		context,
		state,
		forms: formsById,
		compile(formId: string): CompiledFormState {
			const compiled = createCompiledQueryProjections(buildFormQuery(formsById[formId], this.state.value, this.context));
			compileListeners.forEach(callback => callback(formId, compiled));
			return compiled;
		},
		persist(formId: string): PersistableFormState {
			const persisted = {
				...this.compile(formId),
				formId,
				state: pickActiveFormState(formsById[formId], this.state.value),
				schemaVersion: this.definition.schemaVersion,
			};
			persistListeners.forEach(callback => callback(formId, persisted));
			return persisted;
		},
		submit(formId: string): PersistableSubmittableFormState {
			const submitted = {
				...this.persist(formId),
				summaries: this.summarize(formId),
				resultPreset: formsById[formId]?.resultPreset ?? {},
			};
			submitListeners.forEach(callback => callback(formId, submitted));
			return submitted;
		},
		// TODO perhaps introduce SummarizedFormState that contains a bit of a richer interface?
		summarize(formId: string): SummaryEntry[] {
			const summaries = summarizeForm(formsById[formId], this.state.value, this.context);
			summarizeListeners.forEach(callback => callback(formId, summaries));
			return summaries;
		},
		reset() {
			this.state.value = createFormState(this.definition, this.context);
		},

		onCompile(callback: (formId: string, compiled: CompiledFormState) => void) {
			compileListeners.push(callback);
		},
		onSubmit(callback: (formId: string, submitted: PersistableSubmittableFormState) => void) {
			submitListeners.push(callback);
		},
		onSummarize(callback: (formId: string, summaries: SummaryEntry[]) => void) {
			summarizeListeners.push(callback);
		},
		onPersist(callback: (formId: string, persisted: PersistableFormState) => void) {
			persistListeners.push(callback);
		},
	};
}

export function provideFormSystemRuntime(runtime: FormSystemRuntime) {
	provide(formSystemRuntimeKey, runtime);
}

export function useFormSystemRuntime(): FormSystemRuntime {
	const runtime = inject(formSystemRuntimeKey);
	if (!runtime) throw new Error('No form system runtime has been provided.');
	return runtime;
}

export function provideParentForm(runtime: ParentFormRuntime) {
	provide(parentFormRuntimeKey, runtime);
}

function createParentFormAccess(runtime: ParentFormRuntime): UseParentFormReturn {
	return {
		get compiled() {
			return runtime.compiled.value;
		},
		get corpus() {
			return runtime.corpus;
		},
		get formId() {
			return runtime.formId.value;
		},
		get formState() {
			return runtime.formState.value;
		},
		get summaries() {
			return runtime.summaries.value;
		},
	};
}

export function useParentForm(): UseParentFormReturn {
	const runtime = inject(parentFormRuntimeKey);
	if (!runtime) throw new Error('No parent form runtime has been provided.');
	return createParentFormAccess(runtime);
}

export function createAndProvideParentForm(rootFormSystem: FormSystemRuntime, formId: MaybeRefOrGetter<string>): UseParentFormReturn {
	const runtime = createParentFormRuntime(rootFormSystem, formId);
	provideParentForm(runtime);
	return createParentFormAccess(runtime);
}
