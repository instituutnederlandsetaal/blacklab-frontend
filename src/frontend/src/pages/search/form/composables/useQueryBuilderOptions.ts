import { computed } from 'vue';

import { useCurrentCorpusId } from '@/entities/corpus/model/current-corpus-id';
import { useBlackLabApi } from '@/shared/api/useApi';
import * as CorpusStore from '@/entities/corpus/model/legacy-corpus-store';
import * as UIStore from '@/pages/search/config/ui-customization-store';
import { getAnnotationSubset } from '@/shared/blacklab-helpers/field-groups';
import { useI18n } from '@/shared/i18n';
import type { NormalizedAnnotation } from '@/types/apptypes';
import { type CqlQueryBuilderOptions, OPERATORS, COMPARATORS } from '@/widgets/cql-query-builder/model';

const useQueryBuilderOptions = () =>
	computed<CqlQueryBuilderOptions>(() => {
		const indexId = useCurrentCorpusId();
		const translate = useI18n();
		const api = useBlackLabApi();

		const textDirection = CorpusStore.get.textDirection();
		const allAnnotationsMap = CorpusStore.get.allAnnotationsMap();
		const searchAnnotationIds = UIStore.getState().search.advanced.searchAnnotationIds;

		const annotationGroups = getAnnotationSubset(searchAnnotationIds, CorpusStore.get.annotationGroups(), allAnnotationsMap, 'Search', translate, textDirection, false, false);

		const annotationOptions = annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options);

		return {
			indexId: indexId.value!,
			defaultAnnotationId: UIStore.getState().search.advanced.defaultSearchAnnotationId,
			textDirection,
			allAnnotationsMap,
			annotationOptions,
			operatorOptions: OPERATORS.map(op => ({
				label: translate.$td(`search.advanced.queryBuilder.boolean_operators.${op}`, op),
				value: op,
			})),
			comparatorOptions: COMPARATORS.map(comp => ({
				label: '',
				options: comp.map(comp => ({
					label: translate.$td(`search.advanced.queryBuilder.comparators.${comp}`, comp),
					value: comp,
				})),
			})),
			autocomplete(annotation: NormalizedAnnotation, term: string): Promise<string[]> {
				return api.getTermAutocomplete(indexId.value!, annotation.annotatedFieldId, annotation.id, term);
			},
		};
	});

export default useQueryBuilderOptions;
