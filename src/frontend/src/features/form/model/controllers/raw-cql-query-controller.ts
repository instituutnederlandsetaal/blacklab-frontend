import type { RawCqlQueryFieldDefinition } from '@/features/form/fields/raw-cql-field';
import { cqlRaw, queryFragment } from '@/features/form/model/compile/query-artifact';
import { scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';

export const expertQueryController = defineFieldController<'raw-cql-query', RawCqlQueryFieldDefinition>({
	kind: 'raw-cql-query',
	createDefaultState: () => '',
	persistence: {
		key: () => 'query',
		codec: scalar()
			.default('')
			.omitWhen(value => !value.trim()),
	},
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, runtime, state) {
		return queryFragment(
			cqlRaw(state),
			state.trim()
				? {
						label: runtime.translate.$t(`search.expert.corpusQueryLanguage`),
						value: state,
					}
				: null,
		);
	},
});
