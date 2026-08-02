import { type CqlQueryBuilderOptions, OPERATORS, COMPARATORS } from '@/features/cql-query-builder/model';
import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import type { NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex } from '@/types/apptypes';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getAnnotationSubset } from '@/shared/blacklab-helpers/field-groups';
import type { Translate } from '@/shared/i18n';
import { optionValues } from '@/shared/utils/options';

function getMainAnnotationGroups(index: NormalizedIndex): NormalizedAnnotationGroup[] {
	return index.annotationGroups.filter(group => group.annotatedFieldId === index.mainAnnotatedField);
}

export function createQueryBuilderOptions(input: { blacklabApi: BlackLabApi; configuration: SearchFormConfiguration; corpus: NormalizedIndex; translate: Translate }): CqlQueryBuilderOptions {
	const { corpus, configuration, blacklabApi, translate } = input;
	const mainField = corpus.annotatedFields[corpus.mainAnnotatedField];
	const allAnnotationsMap = mainField.annotations;
	const annotationGroups = getAnnotationSubset(configuration.queryBuilder.annotationIds, getMainAnnotationGroups(corpus), allAnnotationsMap, 'Search', translate, false, false);
	const annotationOptions = annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(group => group.options);
	const availableAnnotationIds = optionValues(annotationOptions);
	const defaultAnnotationId = availableAnnotationIds.includes(configuration.queryBuilder.defaultAnnotationId) ? configuration.queryBuilder.defaultAnnotationId : (availableAnnotationIds[0] ?? '');

	return {
		indexId: corpus.id,
		defaultAnnotationId,
		textDirection: corpus.textDirection,
		allAnnotationsMap,
		annotationOptions,
		operatorOptions: OPERATORS.map(op => ({
			label: () => translate.$t(`search.advanced.queryBuilder.boolean_operators.${op}`),
			value: op,
		})),
		comparatorOptions: COMPARATORS.map(comparators => ({
			label: '',
			options: comparators.map(comparator => ({
				label: () => translate.$t(`search.advanced.queryBuilder.comparators.${comparator}`),
				value: comparator,
			})),
		})),
		autocomplete(annotation: NormalizedAnnotation, term: string): Promise<string[]> {
			return blacklabApi.getTermAutocomplete(corpus.id, annotation.annotatedFieldId, annotation.id, term);
		},
	};
}
