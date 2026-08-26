import { type Ref } from 'vue';

import type { FormRuntime } from '@/features/form/model/form-runtime';

import { useScopedInjectable } from '@/shared/utils/useInjectable';

type FormRuntimeRef = Readonly<Ref<FormRuntime>>;

const [_formSystemRuntimeKey, provideFormSystemRuntime, useFormSystemRuntime] = useScopedInjectable<FormRuntimeRef>('formSystemRuntime');
const [_parentFormRuntimeKey, provideParentForm, useParentForm] = useScopedInjectable<Ref<string>>('parentFormRuntime');

export { provideFormSystemRuntime, useFormSystemRuntime, provideParentForm, useParentForm };
