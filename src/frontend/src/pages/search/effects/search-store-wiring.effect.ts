import { onScopeDispose, watchEffect } from 'vue';

import { useCurrentCorpusData } from '@/entities/corpus/model/corpus-context';
import * as SearchStore from '@/pages/search/search-store';

export function startSearchStoreWiring() {
	const currentCorpusData = useCurrentCorpusData();
	const stop = watchEffect(() => {
		if (currentCorpusData.isLoaded()) SearchStore.init(currentCorpusData.value);
	});

	onScopeDispose(stop);
}