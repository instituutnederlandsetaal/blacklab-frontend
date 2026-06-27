import { inject, provide, type InjectionKey, type Ref } from 'vue';

import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';

const formSystemRuntimeKey: InjectionKey<FormBuilder> = Symbol('formSystemRuntime');
const parentFormRuntimeKey: InjectionKey<Ref<string>> = Symbol('parentFormRuntime');
export function provideFormSystemRuntime(runtime: FormBuilder) {
	provide(formSystemRuntimeKey, runtime);
}
export function useFormSystemRuntime(): FormBuilder {
	const runtime = inject(formSystemRuntimeKey);
	if (!runtime) throw new Error('No form system runtime has been provided.');
	return runtime;
}

export function provideParentForm(runtime: Ref<string>) {
	provide(parentFormRuntimeKey, runtime);
}
export function useParentForm(): Ref<string> {
	const runtime = inject(parentFormRuntimeKey);
	if (!runtime) throw new Error('No parent form runtime has been provided.');
	return runtime;
}
