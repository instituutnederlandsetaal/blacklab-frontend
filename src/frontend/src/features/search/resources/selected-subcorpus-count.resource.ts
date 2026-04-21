import { blacklab } from '@/api';
import { FilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import * as CorpusStore from '@/store/corpus';
import * as QueryStore from '@/store/query';

import { watchEffect } from 'vue';

export const selectedSubcorpusLoader = new FilteredResultCountLoader(blacklab);

watchEffect(() => {
	const index = CorpusStore.getState();
	if (!index) return;
	const annotatedFieldId = QueryStore.get.sourceField().id;
	const filter = QueryStore.get.filterString();
	selectedSubcorpusLoader.next({index, annotatedFieldId, filter});
});