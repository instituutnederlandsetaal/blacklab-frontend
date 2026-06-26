import { watchEffect, type Ref } from 'vue';

import { FilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import * as QueryStore from '@/features/search/model/query-state';
import type { NormalizedIndex } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';

export let selectedSubcorpusLoader: FilteredResultCountLoader;

export function initSelectedSubcorpusLoader(blacklab: BlackLabApi, corpus: Ref<NormalizedIndex | undefined | null>) {
	selectedSubcorpusLoader = new FilteredResultCountLoader(blacklab);
	watchEffect(() => {
		if (!corpus.value) return;
		const annotatedFieldId = QueryStore.get.sourceField().id;
		const filter = QueryStore.get.filterString();
		selectedSubcorpusLoader.next({ index: corpus.value, annotatedFieldId, filter });
	});
}
