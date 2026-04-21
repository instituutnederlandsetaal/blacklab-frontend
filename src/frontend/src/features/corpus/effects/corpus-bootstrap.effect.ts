import { corpusDataLoader } from '@/features/corpus/resources/corpus-resource';
import { setCurrentCorpusDataGlobal } from '@/interop/window-globals';
import * as RootStore from '@/store';
import { watch } from 'vue';

let stopBootstrapEffect: (() => void)|null = null;

export function startCorpusBootstrapEffect(): () => void {
	if (stopBootstrapEffect) {
		return stopBootstrapEffect;
	}

	stopBootstrapEffect = watch(() => corpusDataLoader.value, (corpusData) => {
		setCurrentCorpusDataGlobal(corpusDataLoader);
		if (corpusData) {
			void RootStore.init(corpusData);
		}
	}, { immediate: true });

	return stopBootstrapEffect;
}