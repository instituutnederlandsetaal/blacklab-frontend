import { blacklab, frontend } from '@/api';
import { indexId, user } from '@/api/async/instances/reactive-variables';
import { CorpusDataLoader } from '@/api/async/logic/corpus/corpus-data-from-id';
import { watch } from 'vue';


export const corpusDataLoader = new CorpusDataLoader(blacklab, frontend);

// Connect to router and loginsystem
watch([indexId, user], ([id, user]) => corpusDataLoader.next({indexId: id ?? null, user}));