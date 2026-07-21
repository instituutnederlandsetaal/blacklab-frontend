import { toValue } from 'vue';

import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel, optionValues } from '@/shared/utils/options';

export type NgramGroupAnnotationControllerConfig = {
	annotationLabels: Readonly<Record<string, string>>;
	defaultAnnotationId: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
export type NgramGroupAnnotationFieldConfig = FieldControllerConfig<SingleSelectFieldDefinition, NgramGroupAnnotationControllerConfig>;

function defaultState(config: NgramGroupAnnotationFieldConfig): string {
	const values = optionValues(config.options);
	const annotationId = config.defaultAnnotationId && values.includes(config.defaultAnnotationId) ? config.defaultAnnotationId : (values[0] ?? null);
	return annotationId ?? '';
}

const persistenceCodec = stringPersistenceCodec(({ config }: FieldPersistenceContext<NgramGroupAnnotationFieldConfig>) => defaultState(config)).refine((value, { config }) => {
	return !value || findOption(config.options, value) ? undefined : `Cannot restore n-gram grouping annotation '${value}' because it is not present in the current options.`;
});

/** N-gram grouping selector. The state remains an annotation id; only the result preset receives the `hit:` prefix. */
export const ngramGroupAnnotationController = defineFieldController<'explore-ngram-group-annotation', SingleSelectFieldDefinition, NgramGroupAnnotationControllerConfig>({
	kind: 'explore-ngram-group-annotation',
	createDefaultState: defaultState,
	persistence: { key: config => config.persistKey, codec: persistenceCodec },
	affectsBlackLabParameters: [],
	getQueryContribution(config, _runtime, state) {
		const annotationId = state;
		if (!annotationId) return queryFragment();
		const option = findOption(config.options, annotationId);
		return queryFragment(
			{
				resultPreset: {
					viewedResults: 'hits',
					groupBy: [`hit:${annotationId}`],
				},
			},
			{
				label: toValue(config.displayName),
				summaryType: ['patt'],
				value: config.annotationLabels[annotationId] ?? optionLabel(option ?? annotationId),
			},
		);
	},
});
