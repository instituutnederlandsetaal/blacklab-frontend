import { watchEffect } from 'vue';

import { FilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import { useCorpus } from '@/app/state/useCorpusContext';
import * as QueryStore from '@/features/search/model/query-state';

import type { BlackLabApi } from '@/shared/api/lib/api-types';

export let selectedSubcorpusLoader: FilteredResultCountLoader;

export function initSelectedSubcorpusLoader(blacklab: BlackLabApi) {
	selectedSubcorpusLoader = new FilteredResultCountLoader(blacklab);
	watchEffect(() => {
		const index = useCorpus().value;
		if (!index) return;
		const annotatedFieldId = QueryStore.get.sourceField().id;
		const filter = QueryStore.get.filterString();
		selectedSubcorpusLoader.next({ index, annotatedFieldId, filter });
	});
}
