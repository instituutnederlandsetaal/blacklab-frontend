import { toValue } from 'vue';

import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import { anyToken, queryFragment, summary } from '@/features/form/model/types/form-query-ir';

import { findOption, optionValues } from '@/shared/utils/options';

export type FrequencyAnnotationControllerConfig = {
	annotationLabels: Readonly<Record<string, string>>;
	defaultAnnotationId: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
export type FrequencyAnnotationFieldConfig = FieldControllerConfig<SingleSelectFieldDefinition, FrequencyAnnotationControllerConfig>;

function defaultState(config: FrequencyAnnotationFieldConfig): string {
	const values = optionValues(config.options);
	const annotationId = config.defaultAnnotationId && values.includes(config.defaultAnnotationId) ? config.defaultAnnotationId : (values[0] ?? null);
	return annotationId ?? '';
}

const persistenceCodec = stringPersistenceCodec(({ config }: FieldPersistenceContext<FrequencyAnnotationFieldConfig>) => defaultState(config)).refine((value, { config }) => {
	return !value || findOption(config.options, value) ? undefined : `Cannot restore frequency annotation '${value}' because it is not present in the current options.`;
});

export const frequencyAnnotationController = defineFieldController<'explore-frequency-annotation', SingleSelectFieldDefinition, FrequencyAnnotationControllerConfig>({
	kind: 'explore-frequency-annotation',
	createDefaultState: defaultState,
	persistence: { key: config => config.persistKey, codec: persistenceCodec },
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		const annotationId = state;
		if (!annotationId) return null;
		return queryFragment(
			{
				pattern: anyToken(),
				resultPreset: {
					viewedResults: 'hits',
					groupBy: [`hit:${annotationId}`],
				},
			},
			summary(toValue(config.displayName), annotationId, this.affectsBlackLabParameters, config.groupId, config.options),
		);
	},
});
