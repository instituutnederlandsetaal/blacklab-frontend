import { useCurrentCorpusData } from '@/_new/app/plugins/installCorpusData';
import * as RootStore from '@/app/state/root-store';
import { setCurrentCorpusDataGlobal } from '@/interop/window-globals';
import { onScopeDispose, watch } from 'vue';

let started = false;
export function startCorpusBootstrapEffect() {
	if (started) return;
	started = true;
	const corpusData = useCurrentCorpusData();
	watch(() => corpusData, data => {
		if (data.isLoaded()) {
			setCurrentCorpusDataGlobal(data.value);
			RootStore.init(data.value);
		}
	}, { deep: true, immediate: true });
	onScopeDispose(() => started = false);
}