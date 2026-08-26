import { toValue } from 'vue';

import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import { anyToken } from '@/features/form/model/types/form-query-ir';

import { findOption, optionLabel, optionText, optionValues, type OptionText } from '@/shared/utils/options';

export type FrequencyAnnotationControllerConfig = {
	annotationLabels: Readonly<Record<string, OptionText>>;
	defaultAnnotationId: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
type FrequencyAnnotationFieldConfig = FieldControllerConfig<SingleSelectFieldDefinition, FrequencyAnnotationControllerConfig>;

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
	outputs: ['patt', 'group'],
	collect(_config, _runtime, state, emit) {
		if (!state) return;
		emit('patt', anyToken());
		emit('group', [`hit:${state}`]);
	},
	summarize(config, _runtime, state, emit) {
		if (!state) return;
		const option = findOption(config.options, state);
		emit({
			label: toValue(config.displayName),
			summaryType: ['patt'],
			group: config.groupId,
			value: optionText(config.annotationLabels[state]) ?? optionLabel(option ?? state),
		});
	},
});
