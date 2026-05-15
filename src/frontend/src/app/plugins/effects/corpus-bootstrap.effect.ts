import { watchEffect } from 'vue';

import { setCurrentCorpusDataGlobal } from '@/app/interop/window-globals';
import { useCurrentCorpusData } from '@/app/plugins/installCorpusData';
import * as CorpusStore from '@/features/corpus/store/corpus-store';
import * as RootStore from '@/pages/search/search-store';

export function startCorpusDataToLegacyStoreInterop() {
	// start reactive effects for legacy store
	const currentCorpusData = useCurrentCorpusData();
	setCurrentCorpusDataGlobal(currentCorpusData);
	watchEffect(() => {
		if (currentCorpusData.isLoaded()) {
			console.log('putting corpus in store');
			CorpusStore.init(currentCorpusData.value);
			RootStore.init(currentCorpusData.value);
		}
	});
}
