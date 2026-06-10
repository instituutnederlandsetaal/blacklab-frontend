import { computed, type ComputedRef } from 'vue';

import { useLegacyCorpusStore } from '@/entities/corpus/model/legacy-corpus-store';
import * as UIStore from '@/pages/search/config/ui-customization-store';
import type { NormalizedAnnotation } from '@/types/apptypes';
import { type CqlQueryBuilderOptions, OPERATORS, COMPARATORS } from '@/widgets/cql-query-builder/model';

import { useBlackLabApi } from '@/shared/api/useApi';
import { getAnnotationSubset } from '@/shared/blacklab-helpers/field-groups';
import { useI18n } from '@/shared/i18n';

export default function useQueryBuilderOptions(): ComputedRef<CqlQueryBuilderOptions> {
	const corpus = useLegacyCorpusStore();
	const api = useBlackLabApi();
	const translate = useI18n();

	const textDirection = corpus.textDirection;
	const allAnnotationsMap = corpus.allAnnotationsMap;
	const searchAnnotationIds = UIStore.getState().search.advanced.searchAnnotationIds;

	debugger;
	const annotationGroups = getAnnotationSubset(searchAnnotationIds, corpus.annotationGroups, allAnnotationsMap, 'Search', translate, false, false);

	const annotationOptions = annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options);

	return computed(() => ({
		indexId: corpus.indexId,
		defaultAnnotationId: UIStore.getState().search.advanced.defaultSearchAnnotationId,
		textDirection,
		allAnnotationsMap,
		annotationOptions,
		operatorOptions: OPERATORS.map(op => ({
			label: translate.$t(`search.advanced.queryBuilder.boolean_operators.${op}`),
			value: op,
		})),
		comparatorOptions: COMPARATORS.map(comp => ({
			label: '',
			options: comp.map(comp => ({
				label: translate.$t(`search.advanced.queryBuilder.comparators.${comp}`),
				value: comp,
			})),
		})),
		autocomplete(annotation: NormalizedAnnotation, term: string): Promise<string[]> {
			return api.getTermAutocomplete(corpus.indexId, annotation.annotatedFieldId, annotation.id, term);
		},
	}));
}
