import { toValue, watch, type MaybeRefOrGetter } from 'vue';

import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import { selectedSubcorpusLoader } from '@/features/search/resources/selected-subcorpus-count.resource';
import type { Corpus } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';

export function startSelectedSubcorpusEffect(corpus: MaybeRefOrGetter<Corpus | undefined>, blacklab: BlackLabApi, searchParameters: MaybeRefOrGetter<EffectiveSearchParameters | undefined>) {
	return watch(
		[() => toValue(corpus), () => toValue(searchParameters)?.searchfield, () => toValue(searchParameters)?.filter],
		([index, field, filter]) => {
			if (!index) return;
			selectedSubcorpusLoader.next({ index, annotatedFieldId: field ?? index.mainAnnotatedField, filter, blacklab });
		},
		{ immediate: true },
	);
}
