import { ref, watch } from 'vue';

import * as RootStore from '@/app/state/root-store';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as QueryStore from '@/features/search/model/query-state';
import { selectedSubcorpusLoader } from '@/features/search/resources/selected-subcorpus-count.resource';
import { setCurrentCorpusDataGlobal } from '@/interop/window-globals';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Loadable } from '@/shared/utils/loadable/loadable-core';

export default function startGlobalCorpusDependentEffects(context: Loadable<CorpusContext>, blacklab: BlackLabApi) {
	const canUpdateSubcorpusLoader = ref(false);

	watch(
		() => context.value,
		newContext => {
			canUpdateSubcorpusLoader.value = !!newContext?.index;
			if (!newContext) return;
			setCurrentCorpusDataGlobal(newContext);
			RootStore.init(newContext);
		},
		{ deep: false, immediate: true },
	);

	watch(
		() => canUpdateSubcorpusLoader.value,
		canUpdate => {
			if (!canUpdate) return;

			const annotatedFieldId = QueryStore.get.sourceField().id;
			const filter = QueryStore.get.filterString();
			selectedSubcorpusLoader.next({ index: context.value!.index!, annotatedFieldId, filter, blacklab });
		},
	);
}
