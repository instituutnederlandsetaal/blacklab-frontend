import { withSummary, artifactFromPattern, rawPattern } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { UiConfig } from '@/features/form/model/types/form-shape';

export type RawCqlQueryFieldState = {
	query: string;
	targetQueries: string[];
};

export type RawCqlQueryFieldConfig = UiConfig & {
	label?: string;
	helpUrl?: string;
	rows?: number;
};

export const expertQueryController: FieldController<'raw-cql-query', RawCqlQueryFieldState, RawCqlQueryFieldConfig> = {
	kind: 'raw-cql-query',
	createDefaultState: () => ({ query: '', targetQueries: [] }),
	getQueryContribution({ node, state }) {
		return withSummary(artifactFromPattern(rawPattern(state.query)), state.query ? { id: node.id, label: node.config.label ?? 'Expert query', value: state.query } : null);
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default expertQueryController;
