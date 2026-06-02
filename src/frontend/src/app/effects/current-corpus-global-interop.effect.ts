import { watchEffect } from 'vue';

import { setCurrentCorpusDataGlobal } from '@/app/interop/window-globals';
import { useCurrentCorpusData } from '@/entities/corpus/model/corpus-context';

export function startCurrentCorpusGlobalInterop() {
	const currentCorpusData = useCurrentCorpusData();

	watchEffect(() => {
		setCurrentCorpusDataGlobal(currentCorpusData);
	});
}
