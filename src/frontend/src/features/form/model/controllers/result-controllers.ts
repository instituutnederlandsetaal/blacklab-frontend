import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldControllerFor, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';
import type { FormOutputName } from '@/features/form/model/types/form-output';
import type { GroupDisplayMode } from '@/features/search/model/results/result-types';

export type ResultControllerConfig = {
	defaultValue?: string | null;
	persistKey: string;
};
type ResultFieldConfig = FieldControllerConfig<SingleSelectFieldDefinition, ResultControllerConfig>;

function createOutputController<Kind extends string>(kind: Kind, output: Extract<FormOutputName, 'group' | 'sort'>): FieldControllerFor<Kind, SingleSelectFieldDefinition, ResultControllerConfig> {
	const codec = stringPersistenceCodec(({ config }: FieldPersistenceContext<ResultFieldConfig>) => config.defaultValue ?? '');
	return defineFieldController<Kind, SingleSelectFieldDefinition, ResultControllerConfig>({
		kind,
		outputs: [output],
		createDefaultState: config => config.defaultValue ?? '',
		persistence: { key: config => config.persistKey, codec },
		collect: (_config, _runtime, state, emit) => emit(output, state ? [state] : null),
	});
}

export const resultGroupByController = createOutputController('result-group-by', 'group');
export const resultSortController = createOutputController('result-sort', 'sort');

const groupDisplayModes = new Set<GroupDisplayMode>(['table', 'docs', 'hits', 'relative docs', 'relative hits', 'tokens']);

export const resultGroupDisplayModeController = defineFieldController<'result-group-display-mode', SingleSelectFieldDefinition, ResultControllerConfig>({
	kind: 'result-group-display-mode',
	outputs: [],
	createDefaultState: config => config.defaultValue ?? '',
	persistence: {
		key: config => config.persistKey,
		codec: stringPersistenceCodec(({ config }: FieldPersistenceContext<ResultFieldConfig>) => config.defaultValue ?? ''),
	},
	collect() {},
	getResultPreset(_config, _runtime, state) {
		return { groupDisplayMode: groupDisplayModes.has(state as GroupDisplayMode) ? (state as GroupDisplayMode) : null };
	},
});
