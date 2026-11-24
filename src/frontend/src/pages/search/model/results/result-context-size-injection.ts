import { ref, type Ref } from 'vue';

import createAppInjection from '@/shared/vue/injection';

export const DEFAULT_RESULT_CONTEXT_SIZE = 25;

export const [, provideResultContextSize, useResultContextSize] = createAppInjection<Readonly<Ref<number>>>('result-context-size', () => ref(DEFAULT_RESULT_CONTEXT_SIZE));
