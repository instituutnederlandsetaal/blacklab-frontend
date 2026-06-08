import { computed, inject, provide, ref, shallowRef, toValue, watch, type ComputedRef, type InjectionKey, type MaybeRefOrGetter, type ShallowRef } from 'vue';

import { buildFormQuery, summarizeForm } from '@/features/form/model/compile';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { getAllNodes, pickActiveFormState, reactivePickActiveFormState } from '@/features/form/model/form-utils';
import { cloneFormState, createFormState } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormState, PersistableFormState, PersistableSubmittableFormState, SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormNode } from '@/features/form/model/types/form-shape';
import type { FormState, FormSystemRuntime, FormSystemDefinition, UseParentFormReturn } from '@/features/form/model/types/form-state';

const formSystemRuntimeKey: InjectionKey<FormSystemRuntime> = Symbol('formSystemRuntime');

type ParentFormRuntime = {
	compiled: ComputedRef<CompiledFormState>;
	corpus: FormRuntimeContext['corpus'];
	formId: ComputedRef<string>;
	formState: ShallowRef<FormState>;
	getNode(nodeId: string): FormNode | undefined;
	getSummariesForNode(nodeId: string): SummaryEntry[];
	summaries: ComputedRef<SummaryEntry[]>;
};

const parentFormRuntimeKey: InjectionKey<ParentFormRuntime> = Symbol('parentFormRuntime');

function applyRawOverrides(compiled: CompiledFormState, state: FormState): CompiledFormState {
	const overrides = state.rawOverrides ?? {};
	return {
		patt: overrides.patt || compiled.patt,
		filter: overrides.filter || compiled.filter,
		searchfield: overrides.searchfield || compiled.searchfield,
	};
}

export function createParentFormRuntime(rootRuntime: FormSystemRuntime, formId: MaybeRefOrGetter<string>) {
	const currentFormId = computed(() => toValue(formId));
	const currentForm = computed(() => {
		const form = rootRuntime.forms[currentFormId.value];
		if (!form) throw new Error(`Form with id ${currentFormId.value} is not registered.`);
		return form;
	});
	const formState = shallowRef<FormState>(reactivePickActiveFormState(currentForm.value, rootRuntime.state.value));
	const nodesById = computed<Record<string, FormNode>>(() => Object.fromEntries(getAllNodes(currentForm.value).map(node => [node.id, node])));
	const summaries = computed(() => rootRuntime.summarize(currentFormId.value));

	watch(
		[currentForm, () => rootRuntime.state.value],
		([form, state]) => {
			formState.value = reactivePickActiveFormState(form, state);
		},
		{ flush: 'sync', deep: false },
	);

	return {
		compiled: computed(() => rootRuntime.compile(currentFormId.value)),
		corpus: rootRuntime.context.corpus,
		formId: currentFormId,
		formState,
		getNode: (nodeId: string) => {
			return nodesById.value[nodeId];
		},
		getSummariesForNode: (nodeId: string) => {
			const node = nodesById.value[nodeId];
			if (!node) return [];

			const descendants = getAllNodes(node);
			const descendantIds = new Set(descendants.map(descendant => descendant.id));
			const summaryGroups = new Set(
				descendants
					.filter(descendant => descendant.kind === 'field')
					.map(descendant => ('groupId' in descendant && typeof descendant.groupId === 'string' ? descendant.groupId : null))
					.filter((groupId): groupId is string => groupId != null),
			);

			return summaries.value.filter(summary => {
				return descendantIds.has(summary.id) || (summary.group != null && (descendantIds.has(summary.group) || summaryGroups.has(summary.group)));
			});
		},
		summaries,
	};
}

export function createFormSystemRuntime(definition: FormSystemDefinition, context: FormRuntimeContext, initialState?: FormState): FormSystemRuntime {
	const formsList = getAllNodes(definition.root, 'form');
	const formsById = Object.fromEntries(formsList.map(form => [form.id, form]));
	const state = ref<FormState>(initialState ? cloneFormState(initialState) : createFormState(definition, context));

	const compileListeners: ((formId: string, compiled: CompiledFormState) => void)[] = [];
	const submitListeners: ((formId: string, submitted: PersistableSubmittableFormState) => void)[] = [];
	const summarizeListeners: ((formId: string, summaries: SummaryEntry[]) => void)[] = [];
	const persistListeners: ((formId: string, persisted: PersistableFormState) => void)[] = [];
	const resetListeners: (() => void)[] = [];

	const compile: FormSystemRuntime['compile'] = (formId: string): CompiledFormState => {
		const compiled = applyRawOverrides(compileQueryIR(buildFormQuery(formsById[formId], state.value, context)), state.value);
		compileListeners.forEach(callback => callback(formId, compiled));
		return compiled;
	};

	const persist: FormSystemRuntime['persist'] = (formId: string): PersistableFormState => {
		const persisted = {
			...compile(formId),
			formId,
			state: pickActiveFormState(formsById[formId], state.value),
		};
		persistListeners.forEach(callback => callback(formId, persisted));
		return persisted;
	};

	const submit: FormSystemRuntime['submit'] = (formId: string): PersistableSubmittableFormState => {
		const submitted = {
			...persist(formId),
			summaries: summarize(formId),
			resultPreset: formsById[formId]?.resultPreset ?? {},
		};
		submitListeners.forEach(callback => callback(formId, submitted));
		return submitted;
	};

	const summarize: FormSystemRuntime['summarize'] = (formId: string): SummaryEntry[] => {
		const summaries = summarizeForm(formsById[formId], state.value, context);
		summarizeListeners.forEach(callback => callback(formId, summaries));
		return summaries;
	};

	return {
		definition,
		context,
		state,
		forms: formsById,

		compile,
		persist,

		submit,
		// TODO perhaps introduce SummarizedFormState that contains a bit of a richer interface?
		summarize,
		reset: () => {
			state.value = createFormState(definition, context);
			resetListeners.forEach(callback => callback());
		},
		clearRawOverride: parameter => {
			delete state.value.rawOverrides[parameter];
		},

		onCompile: (callback: (formId: string, compiled: CompiledFormState) => void) => {
			compileListeners.push(callback);
		},
		onSubmit: (callback: (formId: string, submitted: PersistableSubmittableFormState) => void) => {
			submitListeners.push(callback);
		},
		onReset: (callback: () => void) => {
			resetListeners.push(callback);
		},
		onSummarize: (callback: (formId: string, summaries: SummaryEntry[]) => void) => {
			summarizeListeners.push(callback);
		},
		onPersist: (callback: (formId: string, persisted: PersistableFormState) => void) => {
			persistListeners.push(callback);
		},
		replaceState: (nextState: FormState) => {
			state.value = cloneFormState(nextState);
		},
		shutdown: () => {
			compileListeners.length = 0;
			submitListeners.length = 0;
			summarizeListeners.length = 0;
			persistListeners.length = 0;
			resetListeners.length = 0;
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
		getNode(nodeId: string) {
			return runtime.getNode(nodeId);
		},
		getSummariesForNode(nodeId: string) {
			return runtime.getSummariesForNode(nodeId);
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
