import { withSearchField, createQueryArtifact, createQueryContribution } from '@/features/form/model/compile/query-artifact';
import type { FieldController } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types/form-shape';

import type { Translate } from '@/shared/i18n';

export type ParallelFieldState = {
	source: string | null;
	targets: string[];
	alignBy: string | null;
};

export type ParallelFieldConfig = {
	sourceOptions: ParallelAnnotatedField[];
	targetOptions: ParallelAnnotatedField[];
	alignByOptions?: string[];
};

export type ParallelFieldComponentProps = ImplicitFieldComponentProps<ParallelFieldState> & ParallelFieldConfig;

type ParallelAnnotatedField = Parameters<Translate['$tAnnotatedFieldDisplayName']>[0];

function translatedAnnotatedField(runtime: Parameters<NonNullable<FieldController['getQueryContribution']>>[1], field: ParallelAnnotatedField | undefined, fallback: string) {
	return field ? (runtime.translate?.$tAnnotatedFieldDisplayName(field) ?? field.defaultDisplayName ?? field.version ?? field.id) : fallback;
}

function translatedAlignBy(runtime: Parameters<NonNullable<FieldController['getQueryContribution']>>[1], alignBy: string) {
	return runtime.translate?.$tAlignByDisplayName({ value: alignBy }) ?? alignBy;
}

export const parallelController: FieldController<'parallel', ParallelFieldState, ParallelFieldConfig> = {
	kind: 'parallel',
	createDefaultState: config => ({
		source: config.sourceOptions[0]?.id ?? null,
		targets: [],
		alignBy: config.alignByOptions?.[0] ?? null,
	}),
	getQueryContribution(config, runtime, state) {
		const artifact = withSearchField(createQueryArtifact(), state.source);
		const entries: SummaryEntry[] = [];
		if (state.source)
			entries.push({
				id: `${config.id}.source`,
				label: runtime.translate?.$t(`search.parallel.searchSourceVersion`) ?? 'Source',
				value: translatedAnnotatedField(runtime, config.sourceOptions.find(field => field.id === state.source), state.source),
			});
		if (state.targets.length)
			entries.push({
				id: `${config.id}.targets`,
				label: runtime.translate?.$t(`search.parallel.andCompareWithTargetVersions`) ?? 'Targets',
				value: state.targets.map(target => translatedAnnotatedField(runtime, config.targetOptions.find(field => field.id === target), target)).join(', '),
			});
		if (state.alignBy)
			entries.push({
				id: `${config.id}.alignBy`,
				label: runtime.translate?.$t(`search.parallel.alignBy`) ?? 'Align by',
				value: translatedAlignBy(runtime, state.alignBy),
			});
		return createQueryContribution(artifact, entries);
	},
	// Return something unique for this controller
	toJSON() {
		return { kind: this.kind, version: 1, configVersion: 1 };
	},
};
export default parallelController;
