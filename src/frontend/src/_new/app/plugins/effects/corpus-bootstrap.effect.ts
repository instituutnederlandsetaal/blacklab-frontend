import { watchEffect } from 'vue';

import { setCurrentCorpusDataGlobal } from '@/_new/app/interop/window-globals';
import { useCurrentCorpusData } from '@/_new/app/plugins/installCorpusData';
import * as CorpusStore from '@/_new/features/corpus/store/corpus-store';
import * as RootStore from '@/_new/pages/search/search-store';

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
