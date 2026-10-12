import { ref, type Ref } from 'vue';

import useInjectable from '@/shared/utils/useInjectable';

export const DEFAULT_RESULT_CONTEXT_SIZE = 25;

export const [, provideResultContextSize, useResultContextSize] = useInjectable<Readonly<Ref<number>>>('result-context-size', () => ref(DEFAULT_RESULT_CONTEXT_SIZE));
