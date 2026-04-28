import { CorpusDataLoader } from '@/_new/entities/corpus-data-from-id';
import { blacklab, frontend } from '@/_new/shared/api';
import { indexId, user } from '@/navigation/route-context';
import { watch } from 'vue';

export const corpusDataLoader = new CorpusDataLoader(blacklab, frontend);

watch([indexId, user], ([id, currentUser]) => {
	corpusDataLoader.next({indexId: id ?? null, user: currentUser})
}, {immediate: true});