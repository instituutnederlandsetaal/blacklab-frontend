import { toValue } from 'vue';

import type { SelectFieldDefinition, SelectFieldState } from '@/features/form/fields/generic/select-field';
import { anyToken, queryFragment } from '@/features/form/model/compile/query-artifact';
import { decodePersistSingleSelection } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel, optionValues } from '@/shared/utils/options';

export type FrequencyAnnotationControllerConfig = {
	annotationLabels: Readonly<Record<string, string>>;
	defaultAnnotationId: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
export type FrequencyAnnotationFieldConfig = FieldControllerConfig<SelectFieldDefinition, FrequencyAnnotationControllerConfig>;

function defaultState(config: FrequencyAnnotationFieldConfig): SelectFieldState {
	const values = optionValues(config.options);
	const annotationId = config.defaultAnnotationId && values.includes(config.defaultAnnotationId) ? config.defaultAnnotationId : (values[0] ?? null);
	return annotationId ? [annotationId] : [];
}

export const frequencyAnnotationController = defineFieldController<'explore-frequency-annotation', SelectFieldDefinition, FrequencyAnnotationControllerConfig>({
	kind: 'explore-frequency-annotation',
	createDefaultState: defaultState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state[0] || null;
	},
	restore(payload, config) {
		const annotationId = decodePersistSingleSelection(payload);
		if (!annotationId) return defaultState(config);
		if (findOption(config.options, annotationId)) return [annotationId];
		return {
			state: defaultState(config),
			warnings: [`Dropped restored frequency annotation '${annotationId}' because it is no longer present in the current options.`],
		};
	},
	getQueryContribution(config, _runtime, state) {
		const annotationId = state[0];
		if (!annotationId) return queryFragment();
		const option = findOption(config.options, annotationId);
		return queryFragment(
			{
				pattern: anyToken(),
				resultPreset: {
					viewedResults: 'hits',
					groupBy: [`hit:${annotationId}`],
				},
			},
			{
				id: config.id,
				label: toValue(config.displayName),
				value: config.annotationLabels[annotationId] ?? optionLabel(option ?? annotationId),
			},
		);
	},
});
