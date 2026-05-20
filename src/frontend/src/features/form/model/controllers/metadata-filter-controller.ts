import { markRaw } from 'vue';

import { artifactFromFilter, rawFilter, withSummary } from '@/features/form/model/compile/query-artifact';
import { getDefaultFilterValue, getValueFunctions, isFilterActive } from '@/features/form/model/filter-value-functions';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import MetadataFilterField from '@/features/form/fields/MetadataFilterField.vue';

export type MetadataFilterFieldState = unknown;

export type MetadataFilterFieldConfig<MetadataType = unknown> = FieldControllerConfig & {
	id: string;
	defaultDisplayName: string;
	defaultDescription?: string;
	componentName: string;
	behaviourName?: string;
	groupId?: string;
	metadata?: MetadataType;
	textDirection?: 'ltr' | 'rtl';
};

export const metadataFilterController: FieldController<'metadata-filter', MetadataFilterFieldState, MetadataFilterFieldConfig> = markRaw({
	kind: 'metadata-filter',
	component: MetadataFilterField,
	createDefaultState: node => getDefaultFilterValue(node.config),
	buildQuery({ node, state }) {
		const lucene = getValueFunctions(node.config).luceneQuery(node.config.id, node.config.metadata, state);
		const summary = getFilterSummaryEntry(node.id, node.config, state);
		return withSummary(artifactFromFilter(rawFilter(lucene)), summary);
	},

	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
});
export default metadataFilterController;

function getFilterSummaryEntry(nodeId: string, definition: MetadataFilterFieldConfig, state: unknown): SummaryEntry | null {
	if (!isFilterActive(definition, state)) return null;
	const value = getValueFunctions(definition).luceneQuerySummary(definition.id, definition.metadata, state);
	return value ? { id: nodeId, label: definition.defaultDisplayName, value, group: definition.groupId } : null;
}
