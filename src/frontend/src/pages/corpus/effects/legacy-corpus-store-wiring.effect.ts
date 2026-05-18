import { onScopeDispose, watchEffect } from 'vue';

import { useCurrentCorpusData } from '@/entities/corpus/model/corpus-context';
import * as LegacyCorpusStore from '@/entities/corpus/model/legacy-corpus-store';

export function startLegacyCorpusStoreWiring() {
	const currentCorpusData = useCurrentCorpusData();
	const stop = watchEffect(() => {
		if (currentCorpusData.isLoaded()) LegacyCorpusStore.init(currentCorpusData.value);
		else if (currentCorpusData.isError() || currentCorpusData.isEmpty()) LegacyCorpusStore.actions.reset();
	});

	onScopeDispose(() => {
		stop();
		LegacyCorpusStore.actions.reset();
	});
}