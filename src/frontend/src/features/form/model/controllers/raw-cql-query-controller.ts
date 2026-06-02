import { withSummary, artifactFromPattern, rawPattern } from '@/features/form/model/compile/query-artifact';
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
	getQueryContribution(config, runtime, state) {
		return withSummary(
			artifactFromPattern(rawPattern(state.query)),
			state.query
				? {
						id: config.id,
						label: runtime.translate.$t(`search.expert.corpusQueryLanguage`),
						value: state.query,
					}
				: null,
		);
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default expertQueryController;
