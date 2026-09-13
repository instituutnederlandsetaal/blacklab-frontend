import { toValue, watch, type MaybeRefOrGetter } from 'vue';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import { selectedSubcorpusLoader } from '@/features/search/resources/selected-subcorpus-count.resource';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import type { Loadable } from '@/shared/utils/loadable/loadable-core';

export default function startGlobalCorpusDependentEffects(context: Loadable<CorpusContext>, blacklab: BlackLabApi, searchParameters: MaybeRefOrGetter<EffectiveSearchParameters | undefined>) {
	watch(
		[() => context.value?.index, () => toValue(searchParameters)?.searchfield, () => toValue(searchParameters)?.filter],
		([index, field, filter]) => {
			if (!index) return;

			const annotatedFieldId = field ?? index.mainAnnotatedField;
			selectedSubcorpusLoader.next({ index, annotatedFieldId, filter, blacklab });
		},
		{ immediate: true },
	);
}
