import { toValue } from 'vue';

import type { SingleSelectFieldDefinition } from '@/features/form/fields/generic/select-field';
import { queryFragment } from '@/features/form/model/compile/query-artifact';
import { stringPersistenceCodec } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerConfig, type FieldPersistenceContext } from '@/features/form/model/types/form-controllers';

import { findOption, optionLabel, optionValues } from '@/shared/utils/options';

export type ParallelSourceControllerConfig = {
	defaultSource: string | null;
	/** Stable and unique within the containing form. */
	persistKey: string;
};
export type ParallelSourceFieldConfig = FieldControllerConfig<SingleSelectFieldDefinition, ParallelSourceControllerConfig>;

function defaultState(config: ParallelSourceFieldConfig): string {
	const values = optionValues(config.options);
	const source = config.defaultSource && values.includes(config.defaultSource) ? config.defaultSource : (values[0] ?? null);
	return source ?? '';
}

const persistenceCodec = stringPersistenceCodec(({ config }: FieldPersistenceContext<ParallelSourceFieldConfig>) => defaultState(config)).refine((value, { config }) => {
	return !value || findOption(config.options, value) ? undefined : `Cannot restore parallel source '${value}' because it is not present in the current options.`;
});

/** Source-version selector for Explore forms; it contributes no CQL pattern. */
export const parallelSourceController = defineFieldController<'parallel-source', SingleSelectFieldDefinition, ParallelSourceControllerConfig>({
	kind: 'parallel-source',
	createDefaultState: defaultState,
	persistence: { key: config => config.persistKey, codec: persistenceCodec },
	affectsBlackLabParameters: ['searchfield'],
	getQueryContribution(config, _runtime, state) {
		const source = state;
		if (!source) return queryFragment();
		const option = findOption(config.options, source);
		return queryFragment(
			{ searchfield: source },
			{
				label: toValue(config.displayName),
				value: optionLabel(option ?? source),
			},
		);
	},
});
