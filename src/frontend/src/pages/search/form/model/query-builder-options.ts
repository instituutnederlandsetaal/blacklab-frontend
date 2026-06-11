import type { SearchUiConfig } from '@/pages/search/config/search-ui-config';
import type { NormalizedAnnotation, NormalizedAnnotationGroup, NormalizedIndex } from '@/types/apptypes';
import { type CqlQueryBuilderOptions, OPERATORS, COMPARATORS } from '@/widgets/cql-query-builder/model';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getAnnotationSubset } from '@/shared/blacklab-helpers/field-groups';
import type { Translate } from '@/shared/i18n';

function getMainAnnotationGroups(index: NormalizedIndex): NormalizedAnnotationGroup[] {
	return index.annotationGroups.filter(group => group.annotatedFieldId === index.mainAnnotatedField);
}

export function createQueryBuilderOptions(input: { index: NormalizedIndex; searchUi: SearchUiConfig; api: BlackLabApi; translate: Translate }): CqlQueryBuilderOptions {
	const { index, searchUi, api, translate } = input;
	const mainField = index.annotatedFields[index.mainAnnotatedField];
	const allAnnotationsMap = mainField.annotations;
	const annotationGroups = getAnnotationSubset(searchUi.search.advanced.searchAnnotationIds, getMainAnnotationGroups(index), allAnnotationsMap, 'Search', translate, false, false);
	const annotationOptions = annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(group => group.options);

	return {
		indexId: index.id,
		defaultAnnotationId: searchUi.search.advanced.defaultSearchAnnotationId,
		textDirection: index.textDirection,
		allAnnotationsMap,
		annotationOptions,
		operatorOptions: OPERATORS.map(op => ({
			label: translate.$t(`search.advanced.queryBuilder.boolean_operators.${op}`),
			value: op,
		})),
		comparatorOptions: COMPARATORS.map(comparators => ({
			label: '',
			options: comparators.map(comparator => ({
				label: translate.$t(`search.advanced.queryBuilder.comparators.${comparator}`),
				value: comparator,
			})),
		})),
		autocomplete(annotation: NormalizedAnnotation, term: string): Promise<string[]> {
			return api.getTermAutocomplete(index.id, annotation.annotatedFieldId, annotation.id, term);
		},
	};
}
