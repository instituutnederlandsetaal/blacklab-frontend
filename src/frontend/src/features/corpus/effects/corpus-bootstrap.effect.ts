import * as RootStore from '@/app/state/root-store';
import { corpusDataLoader } from '@/features/corpus/resources/corpus-resource';
import { setCurrentCorpusDataGlobal } from '@/interop/window-globals';
import { onScopeDispose, watch } from 'vue';

let started = false;
export function startCorpusBootstrapEffect() {
	if (started) return;
	started = true;
	watch(() => corpusDataLoader.value, (corpusData) => {
		setCurrentCorpusDataGlobal(corpusDataLoader);
		if (corpusData) {
			void RootStore.init(corpusData);
		}
	}, { immediate: true });
	onScopeDispose(() => started = false);
}