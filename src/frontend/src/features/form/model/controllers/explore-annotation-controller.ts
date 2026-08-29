import { toValue } from 'vue';

import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import { anyToken } from '@/features/form/model/types/form-query-ir';

import { findOption, optionLabel, optionText, optionValues, type OptionText } from '@/shared/utils/options';

export type ExploreAnnotationControllerConfig = {
	annotationLabels: Readonly<Record<string, OptionText>>;
	defaultAnnotationId: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
type Config<Extra extends ExploreAnnotationControllerConfig = ExploreAnnotationControllerConfig> = FieldControllerConfig<SingleSelectFieldDefinition, Extra>;

function defaultState(config: Config): string {
	const values = optionValues(config.options);
	return (config.defaultAnnotationId && values.includes(config.defaultAnnotationId) ? config.defaultAnnotationId : values[0]) ?? '';
}

export function createExploreAnnotationController<Kind extends string, Extra extends ExploreAnnotationControllerConfig>(kind: Kind, diagnosticName: string, frequency: boolean) {
	const codec = stringPersistenceCodec(({ config }: FieldPersistenceContext<Config<Extra>>) => defaultState(config)).refine((value, { config }) => {
		return !value || findOption(config.options, value) ? undefined : `Cannot restore ${diagnosticName} annotation '${value}' because it is not present in the current options.`;
	});

	return defineFieldController<Kind, SingleSelectFieldDefinition, Extra>({
		kind,
		createDefaultState: defaultState,
		persistence: { key: config => config.persistKey, codec },
		outputs: frequency ? ['patt', 'group'] : ['group'],
		collect(_config, _runtime, state, emit) {
			if (!state) return;
			if (frequency) emit('patt', anyToken());
			emit('group', [`hit:${state}`]);
		},
		summarize(config, _runtime, state, emit) {
			if (!state) return;
			const option = findOption(config.options, state);
			emit({
				label: toValue(config.displayName),
				summaryType: ['patt'],
				...(frequency ? { group: config.groupId } : {}),
				value: optionText(config.annotationLabels[state]) ?? optionLabel(option ?? state),
			});
		},
	});
}
