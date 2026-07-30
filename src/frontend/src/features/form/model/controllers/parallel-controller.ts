import {
	createDefaultParallelChildState,
	createDefaultParallelFieldState,
	type ParallelAnnotatedField,
	type ParallelFieldConfig,
	type ParallelFieldDefinition,
} from '@/features/form/fields/parallel-field';
import type { ParallelFieldState } from '@/features/form/fields/parallel-field';
import { getFieldQueryContribution } from '@/features/form/model/compile';
import { queryFragment, queryIR } from '@/features/form/model/compile/query-artifact';
import { array, object, record, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, encodeFieldState, restoreFieldState, type FieldControllerProps, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query-ir';

import { findOption } from '@/shared/utils/options';

function translatedAnnotatedField(runtime: FormRuntimeContext, field: ParallelAnnotatedField) {
	return runtime.translate.$tAnnotatedFieldDisplayName(field);
}

function translatedAlignBy(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, alignBy: string) {
	return runtime.translate.$tAlignByDisplayName(findOption(config.alignByOptions ?? [], alignBy) ?? { value: alignBy });
}

function getParallelChildContribution(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, state: unknown) {
	return getFieldQueryContribution(config.childFieldTemplate, runtime, state ?? createDefaultParallelChildState(config, runtime));
}

type PersistedParallelState = {
	source: string | null;
	alignBy: string | null;
	targets: string[];
	childPayloads: Record<string, string>;
};

const nullableScalar = scalar().transform<string | null>({ encode: value => value ?? '', decode: value => value || null });

const persistedParallelCodec = object({
	source: nullableScalar.default(({ config, runtime }) => createDefaultParallelFieldState(config, runtime).source).at('s'),
	alignBy: nullableScalar.default(({ config, runtime }) => createDefaultParallelFieldState(config, runtime).alignBy).at('a'),
	targets: array(scalar()).default([]).at('t'),
	childPayloads: record(scalar()).default({}).at('q'),
});

const parallelPersistenceCodec = persistedParallelCodec
	.transform<ParallelFieldState>({
		encode(state, { config, runtime }): PersistedParallelState {
			const childPayloads: Record<string, string> = {};
			for (const fieldId of new Set([state.source, ...state.targets].filter((id): id is string => id != null))) {
				const childState = state.childStates[fieldId] ?? createDefaultParallelChildState(config, runtime);
				const payload = encodeFieldState(config.childFieldTemplate, childState, runtime);
				if (payload) childPayloads[fieldId] = payload;
			}
			return { source: state.source, alignBy: state.alignBy, targets: state.targets, childPayloads };
		},
		decode(state, { config, runtime }) {
			const availableFields = new Set(config.fieldOptions.map((option: ParallelAnnotatedField) => option.id));
			if (state.source != null && !availableFields.has(state.source)) {
				throw new Error(`Cannot restore parallel source '${state.source}' because it is not present in the current field options.`);
			}
			if (new Set(state.targets).size !== state.targets.length) throw new Error('Cannot restore duplicate parallel targets.');
			for (const target of state.targets) {
				if (target === state.source) throw new Error(`Cannot restore parallel target '${target}' because it is also the selected source.`);
				if (!availableFields.has(target)) throw new Error(`Cannot restore parallel field '${target}' because it is not present in the current field options.`);
			}
			if (state.alignBy != null && state.alignBy !== config.defaultAlignBy && !findOption(config.alignByOptions ?? [], state.alignBy)) {
				throw new Error(`Cannot restore parallel alignment '${state.alignBy}' because it is not available in the current form.`);
			}
			const activeFields = [state.source, ...state.targets].filter((fieldId): fieldId is string => fieldId != null);
			const unexpectedPayload = Object.keys(state.childPayloads).find(fieldId => !activeFields.includes(fieldId));
			if (unexpectedPayload) throw new Error(`Cannot restore inactive parallel field '${unexpectedPayload}'.`);
			return {
				source: state.source,
				targets: state.targets,
				alignBy: state.alignBy,
				childStates: Object.fromEntries(
					activeFields.map(fieldId => [
						fieldId,
						state.childPayloads[fieldId] != null ? restoreFieldState(config.childFieldTemplate, state.childPayloads[fieldId], runtime) : createDefaultParallelChildState(config, runtime),
					]),
				),
			};
		},
	})
	.default(({ config, runtime }) => createDefaultParallelFieldState(config, runtime));

export const parallelController = defineFieldController<'parallel', ParallelFieldDefinition>({
	kind: 'parallel',
	createDefaultState: createDefaultParallelFieldState,
	persistence: { key: () => 'parallel', codec: parallelPersistenceCodec },
	affectsBlackLabParameters: ['searchfield', 'patt'],
	getQueryContribution(config, runtime, state) {
		const sourceContribution = state.source != null ? getParallelChildContribution(config, runtime, state.childStates[state.source]) : null;
		const targetContributions = state.targets.map(fieldId => ({
			fieldId,
			contribution: getParallelChildContribution(config, runtime, state.childStates[fieldId]),
		}));
		const query = queryIR({
			searchfield: state.source,
			pattern:
				sourceContribution && targetContributions.length
					? {
							type: 'parallel',
							source: sourceContribution.query.pattern,
							targets: targetContributions.map(({ fieldId, contribution }) => ({
								fieldId,
								relationType: state.alignBy,
								pattern: contribution.query.pattern,
							})),
						}
					: sourceContribution
						? sourceContribution.query.pattern
						: null,
		});
		const summaries: SummaryEntry[] = [];
		if (state.source)
			summaries.push({
				label: runtime.translate.$t(`search.parallel.searchSourceVersion`),
				value: translatedAnnotatedField(runtime, config.fieldOptions.find(field => field.id === state.source) ?? { id: state.source }),
				summaryType: ['searchfield', 'patt'],
			});
		if (state.targets.length)
			summaries.push({
				label: runtime.translate.$t(`search.parallel.andCompareWithTargetVersions`),
				value: state.targets.map(target => translatedAnnotatedField(runtime, config.fieldOptions.find(field => field.id === target) ?? { id: target })).join(', '),
				summaryType: ['searchfield', 'patt'],
			});
		if (state.alignBy)
			summaries.push({
				label: runtime.translate.$t(`search.parallel.alignBy`),
				value: translatedAlignBy(config, runtime, state.alignBy),
				summaryType: ['searchfield', 'patt'],
			});

		if (sourceContribution) summaries.push(...sourceContribution.summaries);
		for (const { contribution } of targetContributions) summaries.push(...contribution.summaries);

		return queryFragment({ query, summaries });
	},
});
