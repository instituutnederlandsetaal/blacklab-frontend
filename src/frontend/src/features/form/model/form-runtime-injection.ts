import { type Ref } from 'vue';

import type { FormRuntime } from '@/features/form/model/form-runtime';

import { createScopedInjection } from '@/shared/vue/injection';

type FormRuntimeRef = Readonly<Ref<FormRuntime>>;

const [_formSystemRuntimeKey, provideFormSystemRuntime, useFormSystemRuntime] = createScopedInjection<FormRuntimeRef>('formSystemRuntime');
const [_parentFormRuntimeKey, provideParentForm, useParentForm] = createScopedInjection<Ref<string>>('parentFormRuntime');

export { provideFormSystemRuntime, useFormSystemRuntime, provideParentForm, useParentForm };
