import type { SelectFieldDefinition, SelectFieldState } from '@/features/form/fields/generic/select-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { defineFieldController, type FieldControllerConfig, type FieldControllerFor } from '@/features/form/model/types/form-controllers';
import type { ResultPreset } from '@/features/form/model/types/form-query';

export type ResultPresetControllerConfig = {
	defaultValue?: string | string[] | null;
	persistKey: string;
	resultPreset?: ResultPreset;
};
export type ResultPresetFieldConfig = FieldControllerConfig<SelectFieldDefinition, ResultPresetControllerConfig>;

function createDefaultState(config: ResultPresetFieldConfig): SelectFieldState {
	if (!config.defaultValue) return [];
	return Array.isArray(config.defaultValue) ? [...config.defaultValue] : [config.defaultValue];
}

function createResultPresetController<Kind extends string>(kind: Kind, property: keyof ResultPreset): FieldControllerFor<Kind, SelectFieldDefinition, ResultPresetControllerConfig> {
	return defineFieldController<Kind, SelectFieldDefinition, ResultPresetControllerConfig>({
		kind,
		affectsBlackLabParameters: [],
		createDefaultState,
		getPersistKey: config => config.persistKey,
		getQueryContribution: (config, _runtime, state) => {
			let statePreset: ResultPreset;
			switch (property) {
				case 'viewedResults':
					statePreset = state[0] ? { viewedResults: state[0] } : {};
					break;
				case 'groupBy':
					statePreset = { groupBy: [...state] };
					break;
				case 'sort':
					statePreset = { sort: state[0] ?? null };
					break;
				case 'groupDisplayMode':
					statePreset = { groupDisplayMode: state[0] ?? null };
					break;
			}
			return queryFragment({ resultPreset: { ...config.resultPreset, ...statePreset } });
		},
		encode: state => {
			if (!state.length) return null;
			return property === 'groupBy' ? state : state[0];
		},
		restore: payload => {
			const values = (Array.isArray(payload) ? payload : [payload]).filter(Boolean);
			return property === 'groupBy' ? values : values.slice(0, 1);
		},
	});
}

export const resultViewedResultsController = createResultPresetController('result-viewed-results', 'viewedResults');
export const resultGroupByController = createResultPresetController('result-group-by', 'groupBy');
export const resultSortController = createResultPresetController('result-sort', 'sort');
export const resultGroupDisplayModeController = createResultPresetController('result-group-display-mode', 'groupDisplayMode');
