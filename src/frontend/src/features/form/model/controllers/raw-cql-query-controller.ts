import type { RawCqlQueryFieldDefinition } from '@/features/form/fields/raw-cql-field';
import { cqlRaw, queryFragment } from '@/features/form/model/compile/query-artifact';
import { singleEncodedValue } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController } from '@/features/form/model/types/form-controllers';

export const expertQueryController = defineFieldController<'raw-cql-query', RawCqlQueryFieldDefinition>({
	kind: 'raw-cql-query',
	createDefaultState: () => '',
	getPersistKey: () => 'query',
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.trim() || null;
	},
	restore(payload) {
		return singleEncodedValue(payload, 'raw CQL field');
	},
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
