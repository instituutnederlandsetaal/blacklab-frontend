import { withSummary, artifactFromPattern, rawPattern } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import RawCqlField from '@/features/form/fields/RawCqlField.vue';

export type RawCqlQueryFieldState = {
	query: string;
	targetQueries: string[];
};

export type RawCqlQueryFieldConfig = FieldControllerConfig & {
	label?: string;
	helpUrl?: string;
	rows?: number;
};

export const expertQueryController: FieldController<'raw-cql-query', RawCqlQueryFieldState, RawCqlQueryFieldConfig> = {
	kind: 'raw-cql-query',
	component: RawCqlField,
	createDefaultState: () => ({ query: '', targetQueries: [] }),
	buildQuery({ node, state }) {
		return withSummary(artifactFromPattern(rawPattern(state.query)), state.query ? { id: node.id, label: node.config.label ?? 'Expert query', value: state.query } : null);
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default expertQueryController;
