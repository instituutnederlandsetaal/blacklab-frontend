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
		},
		{ deep: false, immediate: true },
	);

	watch(
		() => canUpdateSubcorpusLoader.value,
		canUpdate => {
			if (!canUpdate) return;

			const annotatedFieldId = QueryStore.get.sourceField();
			const filter = QueryStore.get.filterString();
			selectedSubcorpusLoader.next({ index: context.value!.index!, annotatedFieldId, filter, blacklab });
		},
	);
}

/** Bring non-context state to the same generation before the context is published. */
export function initializeCorpusContextInterop(context: CorpusContext) {
	setCurrentCorpusDataGlobal(context);
	RootStore.init(context);
}
