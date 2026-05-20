import { computed, inject, provide, ref, shallowRef, toValue, type ComputedRef, type InjectionKey, type MaybeRefOrGetter } from 'vue';

import { buildFormQuery, summarizeForm } from '@/features/form/model/compile';
import { createCompiledQueryProjections } from '@/features/form/model/compile/query-artifact';
import { getAllNodes, pickActiveFormState } from '@/features/form/model/form-utils';
import { cloneFormState, createFormState } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormState, PersistableFormState, PersistableSubmittableFormState, SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode } from '@/features/form/model/types/form-shape';
import type { FormState, FormSystemRuntime, FormSystemDefinition, UseParentFormReturn } from '@/features/form/model/types/form-state';

const formSystemRuntimeKey: InjectionKey<FormSystemRuntime> = Symbol('formSystemRuntime');
const parentFormRuntimeKey: InjectionKey<ComputedRef<UseParentFormReturn>> = Symbol('parentFormRuntime');

export function createParentFormRuntime(rootRuntime: FormSystemRuntime, formId: MaybeRefOrGetter<string>) {
	return computed(() => {
		const currentFormId = toValue(formId);
		return {
			compiled: rootRuntime.compile(currentFormId),
			corpus: rootRuntime.context.corpus,
			formId: currentFormId,
			formState: pickActiveFormState(rootRuntime.forms[currentFormId], rootRuntime.state.value),
			summaries: rootRuntime.summarize(currentFormId),
		};
	});
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

export function provideParentForm(runtime: ComputedRef<UseParentFormReturn>) {
	provide(parentFormRuntimeKey, runtime);
}

export function useParentForm(): UseParentFormReturn {
	const runtime = inject(parentFormRuntimeKey);
	if (!runtime) throw new Error('No parent form runtime has been provided.');
	return {
		get compiled() {
			return runtime.value.compiled;
		},
		get corpus() {
			return runtime.value.corpus;
		},
		get formId() {
			return runtime.value.formId;
		},
		get formState() {
			return runtime.value.formState;
		},
		get summaries() {
			return runtime.value.summaries;
		},
	};
}

export function createAndProvideParentForm(rootFormSystem: FormSystemRuntime, formId: MaybeRefOrGetter<string>): UseParentFormReturn {
	const runtime = createParentFormRuntime(rootFormSystem, formId);
	provideParentForm(runtime);
	return runtime.value;
}
