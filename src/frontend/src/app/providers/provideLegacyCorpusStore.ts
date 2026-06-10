import { effectScope, type ObjectPlugin } from 'vue';

import { useCurrentCorpusData } from '@/entities/corpus/model/corpus-context';
import { createLegacyCorpusStore as createLegacyCorpusStoreInstance, provideLegacyCorpusStore } from '@/entities/corpus/model/legacy-corpus-store';

/**
 * Provides the legacy corpus store and keeps it in sync with the current corpus data.
 */
export function createLegacyCorpusStore(): ObjectPlugin {
	return {
		install(app) {
			const effect = effectScope();
			effect.run(() =>
				app.runWithContext(() => {
					const currentCorpusData = useCurrentCorpusData();
					const store = createLegacyCorpusStoreInstance(() => currentCorpusData.value?.index ?? null);
					provideLegacyCorpusStore(app, store);
				}),
			);
			app.onUnmount(() => effect.stop());
		},
	};
}
