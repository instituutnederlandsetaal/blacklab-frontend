import type { Ref } from 'vue';

import useInjectable from '@/shared/lib/vue/useInjectable';

const [_currentDocumentIdInjectionKey, provideCurrentDocumentId, useCurrentDocumentId] = useInjectable<Ref<string | null>>('currentDocumentId');

export { provideCurrentDocumentId, useCurrentDocumentId };
