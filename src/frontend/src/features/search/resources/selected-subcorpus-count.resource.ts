import { watchEffect } from 'vue';

import { blacklab } from '@/api';
import { FilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import * as QueryStore from '@/features/search/model/query-state';

export const selectedSubcorpusLoader = new FilteredResultCountLoader(blacklab);

watchEffect(() => {
	const index = CorpusStore.getState();
	if (!index) return;
	const annotatedFieldId = QueryStore.get.sourceField().id;
	const filter = QueryStore.get.filterString();
	selectedSubcorpusLoader.next({ index, annotatedFieldId, filter });
});
