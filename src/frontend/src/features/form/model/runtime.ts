import { inject, provide, toRef, type InjectionKey, type Ref } from 'vue';

import type { FormRuntime } from '@/features/form/model/form-runtime';

export type FormRuntimeRef = Readonly<Ref<FormRuntime>>;

const formSystemRuntimeKey: InjectionKey<FormRuntimeRef> = Symbol('formSystemRuntime');
const parentFormRuntimeKey: InjectionKey<Ref<string>> = Symbol('parentFormRuntime');
export function provideFormSystemRuntime(runtime: FormRuntime | FormRuntimeRef) {
	provide(formSystemRuntimeKey, toRef(runtime) as FormRuntimeRef);
}
export function useFormSystemRuntime(): FormRuntimeRef {
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
