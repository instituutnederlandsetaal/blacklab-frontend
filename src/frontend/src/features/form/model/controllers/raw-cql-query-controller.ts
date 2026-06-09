import { cqlRaw, queryFragment } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, singleEncodedValue } from '@/features/form/model/controllers/persistence-codec';
import type { FieldController } from '@/features/form/model/types/form-controllers';

export type RawCqlQueryFieldState = string;

export type RawCqlQueryFieldConfig = object;

export const expertQueryController: FieldController<'raw-cql-query', RawCqlQueryFieldState, RawCqlQueryFieldConfig> = {
	kind: 'raw-cql-query',
	createDefaultState: () => '',
	getPersistKey: () => 'query',
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.trim() || null;
	},
	restore(payload) {
		const value = singleEncodedValue(payload, 'raw CQL field');
		if (!value.startsWith('query=') && !value.includes(';targets=')) return value;
		return decodePersistObject(payload).query ?? '';
	},
	getQueryContribution(config, runtime, state) {
		return queryFragment(
			cqlRaw(state),
			state.trim()
				? {
						id: config.id,
						label: runtime.translate.$t(`search.expert.corpusQueryLanguage`),
						value: state,
					}
				: null,
		);
	},
};
export default expertQueryController;
