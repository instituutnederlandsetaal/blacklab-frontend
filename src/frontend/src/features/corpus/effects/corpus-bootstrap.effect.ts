import { watch, type App } from 'vue';

import * as RootStore from '@/app/state/root-store';
import { useCorpusContextLoader } from '@/app/state/useCorpusContext';
import { setCurrentCorpusDataGlobal } from '@/interop/window-globals';

export function startCorpusBootstrapEffect(app: App) {
	app.runWithContext(() => {
		const corpusContext = useCorpusContextLoader();
		watch(
			() => corpusContext.value,
			context => {
				setCurrentCorpusDataGlobal(context);
				if (context) {
					void RootStore.init(context);
				}
			},
			{ immediate: true },
		);
	});
}
