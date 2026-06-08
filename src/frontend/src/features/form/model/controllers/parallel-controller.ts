import { queryFragment, queryIR } from '@/features/form/model/compile/query-artifact';
import { decodePersistRecord, encodePersistObject, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
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

function translatedAnnotatedField(runtime: Parameters<NonNullable<FieldController['getQueryContribution']>>[1], field: ParallelAnnotatedField) {
	return runtime.translate.$tAnnotatedFieldDisplayName(field);
}

function translatedAlignBy(runtime: Parameters<NonNullable<FieldController['getQueryContribution']>>[1], alignBy: string) {
	return runtime.translate.$tAlignByDisplayName({ value: alignBy });
}

function createDefaultParallelFieldState(config: ParallelFieldConfig): ParallelFieldState {
	return {
		source: config.sourceOptions[0]?.id ?? null,
		targets: [],
		alignBy: config.alignByOptions?.[0] ?? null,
	};
}

export const parallelController: FieldController<'parallel', ParallelFieldState, ParallelFieldConfig> = {
	kind: 'parallel',
	createDefaultState: createDefaultParallelFieldState,
	getPersistKey: () => 'parallel',
	affectsBlackLabParameters: ['searchfield'],
	encode(state, config) {
		const defaultState = createDefaultParallelFieldState(config);
		return encodePersistObject({
			source: state.source !== defaultState.source ? state.source : undefined,
			targets: state.targets.length ? joinPersistValues(state.targets) : undefined,
			align: state.alignBy !== defaultState.alignBy ? state.alignBy : undefined,
		});
	},
	restore(payload, config) {
		const restored = decodePersistRecord(payload, ['source', 'targets', 'align'], 'parallel field');
		const defaults = createDefaultParallelFieldState(config);
		return {
			source: restored.source ?? defaults.source,
			targets: splitPersistValue(restored.targets ?? '').filter(Boolean),
			alignBy: restored.align ?? defaults.alignBy,
		};
	},
	getQueryContribution(config, runtime, state) {
		const query = queryIR({ searchfield: state.source });
		const summaries: SummaryEntry[] = [];
		if (state.source)
			summaries.push({
				id: `${config.id}.source`,
				label: runtime.translate.$t(`search.parallel.searchSourceVersion`),
				value: translatedAnnotatedField(runtime, config.sourceOptions.find(field => field.id === state.source) ?? { id: state.source }),
			});
		if (state.targets.length)
			summaries.push({
				id: `${config.id}.targets`,
				label: runtime.translate.$t(`search.parallel.andCompareWithTargetVersions`),
				value: state.targets.map(target => translatedAnnotatedField(runtime, config.targetOptions.find(field => field.id === target) ?? { id: target })).join(', '),
			});
		if (state.alignBy)
			summaries.push({
				id: `${config.id}.alignBy`,
				label: runtime.translate.$t(`search.parallel.alignBy`),
				value: translatedAlignBy(runtime, state.alignBy),
			});
		return queryFragment({ query, summaries });
	},
};
export default parallelController;
