import { type Ref } from 'vue';

import createAppInjection from '@/shared/vue/injection';

const [, provideCorpusId, useCorpusId] = createAppInjection<Ref<string | undefined>>('corpus_id');

export { provideCorpusId, useCorpusId };
