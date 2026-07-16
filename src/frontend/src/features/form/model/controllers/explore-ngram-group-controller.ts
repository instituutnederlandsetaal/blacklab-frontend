import { toValue } from 'vue';

import type { SelectFieldDefinition, SelectFieldState } from '@/features/form/fields/generic/select-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { decodePersistSingleSelection } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel, optionValues } from '@/shared/utils/options';

export type NgramGroupAnnotationControllerConfig = {
	annotationLabels: Readonly<Record<string, string>>;
	defaultAnnotationId: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
export type NgramGroupAnnotationFieldConfig = FieldControllerConfig<SelectFieldDefinition, NgramGroupAnnotationControllerConfig>;

function defaultState(config: NgramGroupAnnotationFieldConfig): SelectFieldState {
	const values = optionValues(config.options);
	const annotationId = config.defaultAnnotationId && values.includes(config.defaultAnnotationId) ? config.defaultAnnotationId : (values[0] ?? null);
	return annotationId ? [annotationId] : [];
}

/** N-gram grouping selector. The state remains an annotation id; only the result preset receives the `hit:` prefix. */
export const ngramGroupAnnotationController = defineFieldController<'explore-ngram-group-annotation', SelectFieldDefinition, NgramGroupAnnotationControllerConfig>({
	kind: 'explore-ngram-group-annotation',
	createDefaultState: defaultState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters: [],
	encode(state) {
		return state[0] || null;
	},
	restore(payload, config) {
		const annotationId = decodePersistSingleSelection(payload);
		if (!annotationId) return defaultState(config);
		if (findOption(config.options, annotationId)) return [annotationId];
		throw new Error(`Cannot restore n-gram grouping annotation '${annotationId}' because it is not present in the current options.`);
	},
	getQueryContribution(config, _runtime, state) {
		const annotationId = state[0];
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
