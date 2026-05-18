import type { Ref } from 'vue';

import useInjectable from '@/shared/lib/vue/useInjectable';

const [_currentCorpusIdInjectionKey, provideCurrentCorpusId, useCurrentCorpusId] = useInjectable<Ref<string | null>>('currentCorpusId');

export { provideCurrentCorpusId, useCurrentCorpusId };