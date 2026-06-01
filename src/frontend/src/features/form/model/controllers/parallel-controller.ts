import { withSearchField, createQueryArtifact, createQueryContribution } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';
import type { FormComponentProps } from '@/features/form/model/types/form-shape';

import { findOption, optionLabel, type Option } from '@/shared/utils/options';

export type ParallelFieldState = {
	source: string | null;
	targets: string[];
	alignBy: string | null;
};

export type ParallelFieldConfig = {
	label?: string;

	// TODO these are i18n values
	// We should just use the system directly in the component/controller
	sourceLabel?: string;
	targetLabel?: string;
	alignByLabel?: string;
	sourceOptions: Option[];
	targetOptions: Option[];
	alignByOptions?: Option[];
};

export type ParallelFieldComponentProps = FormComponentProps<ParallelFieldState> & ParallelFieldConfig;

export const parallelController: FieldController<'parallel', ParallelFieldState, ParallelFieldConfig> = {
	kind: 'parallel',
	createDefaultState: config => ({
		source: config.sourceOptions[0]?.value ?? null,
		targets: [],
		alignBy: config.alignByOptions?.[0]?.value ?? null,
	}),
	// TODO i18n of summary labels, could use existing Translate system though.
	getQueryContribution(config, _runtime, state) {
		const artifact = withSearchField(createQueryArtifact(), state.source);
		const entries: SummaryEntry[] = [];
		if (state.source) entries.push({ id: `${config.id}.source`, label: 'Source', value: optionLabel(findOption(config.sourceOptions, state.source) ?? state.source) });
		if (state.targets.length)
			entries.push({
				id: `${config.id}.targets`,
				label: 'Targets',
				value: state.targets.map(target => optionLabel(findOption(config.targetOptions ?? config.sourceOptions, target) ?? target)).join(', '),
			});
		if (state.alignBy) entries.push({ id: `${config.id}.alignBy`, label: 'Align by', value: optionLabel(findOption(config.alignByOptions ?? [], state.alignBy) ?? state.alignBy) });
		return createQueryContribution(artifact, entries);
	},
	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default parallelController;
