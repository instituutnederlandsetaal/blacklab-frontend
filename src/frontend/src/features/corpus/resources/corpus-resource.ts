import { blacklab, frontend } from '@/api';
import { CorpusDataLoader } from '@/api/async/logic/corpus/corpus-data-from-id';
import { indexId, user } from '@/navigation/route-context';
import { watch } from 'vue';

export const corpusDataLoader = new CorpusDataLoader(blacklab, frontend);

watch([indexId, user], ([id, currentUser]) => {
	corpusDataLoader.next({indexId: id ?? null, user: currentUser})
}, {immediate: true});