import { decodePersistObject, encodePersistObject, firstEncodedValue, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
import type { FieldController } from '@/features/form/model/types/form-controllers';

export type RawCqlQueryFieldState = {
	query: string;
	targetQueries: string[];
};

export type RawCqlQueryFieldConfig = {
	helpUrl?: string;
	rows?: number;
};

export const expertQueryController: FieldController<'raw-cql-query', RawCqlQueryFieldState, RawCqlQueryFieldConfig> = {
	kind: 'raw-cql-query',
	createDefaultState: () => ({ query: '', targetQueries: [] }),
	getPersistKey: () => 'query',
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		if (!state.query.trim() && !state.targetQueries.length) return null;
		if (!state.targetQueries.length) return state.query.trim();
		return encodePersistObject({
			query: state.query,
			targets: joinPersistValues(state.targetQueries),
		});
	},
	restore(payload) {
		const value = firstEncodedValue(payload);
		if (!value.startsWith('query=') && !value.includes(';targets=')) return { query: value, targetQueries: [] };
		const restored = decodePersistObject(payload);
		return {
			query: restored.query ?? '',
			targetQueries: splitPersistValue(restored.targets ?? '').filter(Boolean),
		};
	},
	getQueryContribution(config, runtime, state) {
		return {
			query: {
				pattern: {
					type: 'raw',
					cql: state.query,
				},
				filter: null,
				searchField: null,
				wrappers: [],
			},
			summaries: state.query
				? [
						{
							id: config.id,
							label: runtime.translate.$t(`search.expert.corpusQueryLanguage`),
							value: state.query,
						},
					]
				: [],
		};
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default expertQueryController;
