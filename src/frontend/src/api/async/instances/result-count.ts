import { blacklab } from '@/api';
import { FilteredResultCountLoader } from "@/api/async/logic/result-count/result-count-from-filters";
import * as CorpusStore from '@/store/corpus';
import * as QueryStore from '@/store/query';

import { watchEffect } from 'vue';

export const selectedSubcorpusLoader = new FilteredResultCountLoader(blacklab);

// Connect to corpus and query stores
watchEffect(() => {
	const index = CorpusStore.getState();
	if (!index) return; // wait for corpus to load
	const annotatedFieldId = QueryStore.get.sourceField().id;
	const filter = QueryStore.get.filterString();
	selectedSubcorpusLoader.next({index, annotatedFieldId, filter});
});