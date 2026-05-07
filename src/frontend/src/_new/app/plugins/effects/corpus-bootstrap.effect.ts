// import * as RootStore from '@/app/state/root-store';
import { watchEffect } from 'vue';

import { setCurrentCorpusDataGlobal } from '@/_new/app/features/interop/window-globals';
import { useCurrentCorpusData } from '@/_new/app/plugins/installCorpusData';

export function startCorpusDataToLegacyStoreInterop() {
	// start reactive effects for legacy store
	const currentCorpusData = useCurrentCorpusData();
	setCurrentCorpusDataGlobal(currentCorpusData);
	watchEffect(() => {
		if (currentCorpusData.isLoaded()) {
			// RootStore.init(currentCorpusData.value);
			console.log('should put in store now');
		}
	});
}
