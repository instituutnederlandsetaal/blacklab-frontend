import { withSearchField, createQueryArtifact } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';
import type { FieldControllerConfig } from '@/features/form/model/types/form-shape';

import { findOption, optionLabel, type Option } from '@/shared/utils/options';

import ParallelField from '@/features/form/fields/ParallelField.vue';

export type ParallelFieldState = {
	source: string | null;
	targets: string[];
	alignBy: string | null;
};

export type ParallelFieldConfig = FieldControllerConfig & {
	label?: string;

	// TODO these are i18n values
	// We should just use the system directly in the component/controller
	sourceLabel?: string;
	targetLabel?: string;
	alignByLabel?: string;
	sourceOptions: Option[];
	targetOptions?: Option[];
	alignByOptions?: Option[];
};

export const parallelController: FieldController<'parallel', ParallelFieldState, ParallelFieldConfig> = {
	kind: 'parallel',
	component: ParallelField,
	createDefaultState: node => ({
		source: node.config.sourceOptions[0]?.value ?? null,
		targets: [],
		alignBy: node.config.alignByOptions?.[0]?.value ?? null,
	}),
	// TODO i18n of summary labels, could use existing Translate system though.
	buildQuery({ node, state }) {
		const artifact = withSearchField(createQueryArtifact(), state.source);
		const entries: SummaryEntry[] = [];
		if (state.source) entries.push({ id: `${node.id}.source`, label: 'Source', value: optionLabel(findOption(node.config.sourceOptions, state.source) ?? state.source) });
		if (state.targets.length)
			entries.push({
				id: `${node.id}.targets`,
				label: 'Targets',
				value: state.targets.map(target => optionLabel(findOption(node.config.targetOptions ?? node.config.sourceOptions, target) ?? target)).join(', '),
			});
		if (state.alignBy) entries.push({ id: `${node.id}.alignBy`, label: 'Align by', value: optionLabel(findOption(node.config.alignByOptions ?? [], state.alignBy) ?? state.alignBy) });
		return {
			...artifact,
			summaries: entries,
		};
	},
	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default parallelController;
