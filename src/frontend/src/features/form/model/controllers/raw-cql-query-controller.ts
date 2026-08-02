import type { RawCqlQueryFieldDefinition } from '@/features/form/fields/raw-cql-field';
import { scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';
import { queryFragment, rawCql } from '@/features/form/model/types/form-query-ir';

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
	getQueryContribution(_config, runtime, state) {
		const cql = state.trim();
		if (!cql) return null;
		return queryFragment(rawCql(cql), {
			label: runtime.translate.$t(`search.expert.corpusQueryLanguage`),
			value: state,
		});
	},
});
