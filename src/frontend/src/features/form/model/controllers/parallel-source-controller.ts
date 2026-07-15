import { toValue } from 'vue';

import type { SelectFieldDefinition, SelectFieldState } from '@/features/form/fields/generic/select-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { decodePersistSingleSelection } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel, optionValues } from '@/shared/utils/options';

export type ParallelSourceControllerConfig = {
	defaultSource: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
export type ParallelSourceFieldConfig = FieldControllerConfig<SelectFieldDefinition, ParallelSourceControllerConfig>;

function defaultState(config: ParallelSourceFieldConfig): SelectFieldState {
	const values = optionValues(config.options);
	const source = config.defaultSource && values.includes(config.defaultSource) ? config.defaultSource : (values[0] ?? null);
	return source ? [source] : [];
}

/** Source-version selector for Explore forms; it contributes no CQL pattern. */
export const parallelSourceController = defineFieldController<'parallel-source', SelectFieldDefinition, ParallelSourceControllerConfig>({
	kind: 'parallel-source',
	createDefaultState: defaultState,
	getPersistKey: config => config.persistKey,
	affectsBlackLabParameters: ['searchfield'],
	encode(state) {
		return state[0] || null;
	},
	restore(payload, config) {
		const source = decodePersistSingleSelection(payload);
		if (!source) return defaultState(config);
		if (findOption(config.options, source)) return [source];
		return {
			state: defaultState(config),
			warnings: [`Dropped restored parallel source '${source}' because it is no longer present in the current options.`],
		};
	},
	getQueryContribution(config, _runtime, state) {
		const source = state[0];
		if (!source) return queryFragment();
		const option = findOption(config.options, source);
		return queryFragment(
			{ searchfield: source },
			{
				id: config.id,
				label: toValue(config.displayName),
				value: optionLabel(option ?? source),
			},
		);
	},
});
