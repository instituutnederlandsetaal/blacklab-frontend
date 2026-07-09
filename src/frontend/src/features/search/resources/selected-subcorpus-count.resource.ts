import { watchEffect } from 'vue';

import { FilteredResultCountLoader } from '@/api/async/logic/result-count/result-count-from-filters';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as QueryStore from '@/features/search/model/query-state';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Loadable } from '@/shared/utils/loadable/loadable-core';

export let selectedSubcorpusLoader = new FilteredResultCountLoader();

export function initSelectedSubcorpusLoader(blacklab: BlackLabApi, context: Loadable<CorpusContext>) {
	watchEffect(() => {
		if (!context.value?.index) return;
		const annotatedFieldId = QueryStore.get.sourceField();
		const filter = QueryStore.get.filterString();
		selectedSubcorpusLoader.next({ index: context.value.index, annotatedFieldId, filter, blacklab });
	});
}
