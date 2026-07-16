import { computed } from 'vue';

import { FilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import type { Corpus } from '@/app/state/useCorpusContext';
import type { SummaryTotalsController, TotalsViewState } from '@/features/form';

import type { BlackLabApi } from '@/shared/api/lib/api-types';

export function createSearchFormTotalsFactory(corpus: Corpus, blacklab: BlackLabApi): () => SummaryTotalsController {
	return () => {
		const loader = new FilteredResultCountLoader();
		const state = computed<TotalsViewState>(() => {
			if (loader.isError()) return { status: 'error', message: loader.error?.message ?? 'Could not load result totals.' };
			if (!loader.isLoaded()) return { status: 'loading' };

			return {
				status: 'loaded',
				documents: loader.value.numberOfMatchingDocuments,
				tokens: loader.value.tokensInMatchingDocuments,
				totalDocuments: loader.value.totalDocsInIndex,
				totalTokens: loader.value.totalTokensInIndex,
			};
		});

		return {
			state,
			update: ({ filter, searchfield }) =>
				loader.next({
					index: corpus,
					filter,
					annotatedFieldId: searchfield || corpus.mainAnnotatedField,
					blacklab,
				}),
			dispose: () => loader.dispose(),
		};
	};
}
