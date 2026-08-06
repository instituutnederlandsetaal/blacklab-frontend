import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldControllerFor, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import { queryFragment, type ResultPreset } from '@/features/form/model/types/form-query-ir';

export type ResultPresetControllerConfig = {
	defaultValue?: string | null;
	persistKey: string;
	resultPreset?: ResultPreset;
};
type ResultPresetFieldConfig = FieldControllerConfig<SingleSelectFieldDefinition, ResultPresetControllerConfig>;

function createDefaultState(config: ResultPresetFieldConfig): string {
	return config.defaultValue ?? '';
}

function createResultPresetController<Kind extends string>(
	kind: Kind,
	property: Exclude<keyof ResultPreset, 'withSpans'>,
): FieldControllerFor<Kind, SingleSelectFieldDefinition, ResultPresetControllerConfig> {
	const codec = stringPersistenceCodec(({ config }: FieldPersistenceContext<ResultPresetFieldConfig>) => createDefaultState(config));
	return defineFieldController<Kind, SingleSelectFieldDefinition, ResultPresetControllerConfig>({
		kind,
		affectsBlackLabParameters: [],
		createDefaultState,
		persistence: { key: config => config.persistKey, codec },
		getQueryContribution: (config, _runtime, state) => {
			let statePreset: ResultPreset;
			switch (property) {
				case 'viewedResults':
					statePreset = state ? { viewedResults: state } : {};
					break;
				case 'groupBy':
					statePreset = { groupBy: state ? [state] : [] };
					break;
				case 'sort':
					statePreset = { sort: state || null };
					break;
				case 'groupDisplayMode':
					statePreset = { groupDisplayMode: state || null };
					break;
			}
			return queryFragment({ resultPreset: { ...config.resultPreset, ...statePreset } });
		},
	});
}

export const resultViewedResultsController = createResultPresetController('result-viewed-results', 'viewedResults');
export const resultGroupByController = createResultPresetController('result-group-by', 'groupBy');
export const resultSortController = createResultPresetController('result-sort', 'sort');
export const resultGroupDisplayModeController = createResultPresetController('result-group-display-mode', 'groupDisplayMode');
