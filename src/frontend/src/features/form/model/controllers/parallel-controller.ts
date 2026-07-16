import {
	createDefaultParallelChildState,
	createDefaultParallelFieldState,
	type ParallelAnnotatedField,
	type ParallelFieldConfig,
	type ParallelFieldDefinition,
} from '@/features/form/fields/parallel-field';
import { getFieldQueryContribution } from '@/features/form/model/compile';
import { queryFragment, queryIR } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type FieldControllerProps, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { SummaryEntry } from '@/features/form/model/types/form-query';

import { findOption } from '@/shared/utils/options';

function translatedAnnotatedField(runtime: FormRuntimeContext, field: ParallelAnnotatedField) {
	return runtime.translate.$tAnnotatedFieldDisplayName(field);
}

function translatedAlignBy(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, alignBy: string) {
	return runtime.translate.$tAlignByDisplayName(findOption(config.alignByOptions ?? [], alignBy) ?? { value: alignBy });
}

const CHILD_PREFIX = 'parallel.';

function childPersistKey(fieldId: string): string {
	return `${CHILD_PREFIX}${fieldId}`;
}

function getParallelChildContribution(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, state: unknown) {
	return getFieldQueryContribution(config.childFieldTemplate, runtime, state ?? createDefaultParallelChildState(config, runtime));
}

export const parallelController = defineFieldController<'parallel', ParallelFieldDefinition>({
	kind: 'parallel',
	createDefaultState: createDefaultParallelFieldState,
	getPersistKey: () => 'parallel',
	affectsBlackLabParameters: ['searchfield', 'patt'],
	encode(state, config, runtime) {
		const childConfig = config.childFieldTemplate;
		const defaultState = createDefaultParallelFieldState(config, runtime);
		const values: Record<string, string | null | undefined> = {
			source: state.source !== defaultState.source ? state.source : undefined,
			targets: state.targets.length ? joinPersistValues(state.targets) : undefined,
			align: state.alignBy !== defaultState.alignBy ? state.alignBy : undefined,
		};
		for (const fieldId of new Set([state.source, ...state.targets].filter((id): id is string => id != null))) {
			const encoded = childConfig.controller.encode(state.childStates[fieldId] ?? createDefaultParallelChildState(config, runtime), childConfig, runtime);
			const value = Array.isArray(encoded) ? joinPersistValues(encoded) : encoded;
			if (value) values[childPersistKey(fieldId)] = value;
		}
		return encodePersistObject(values);
	},
	restore(payload, config, runtime) {
		const fields = new Set(config.fieldOptions.map(option => option.id));
		const defaults = createDefaultParallelFieldState(config, runtime);
		const restored = decodePersistObject(payload);
		const source = restored.source ?? defaults.source;
		if (source != null && !fields.has(source)) throw new Error(`Cannot restore parallel source '${source}' because it is not present in the current field options.`);
		const targets = splitPersistValue(restored.targets ?? '').filter(Boolean);
		if (new Set(targets).size !== targets.length) throw new Error('Cannot restore duplicate parallel targets.');
		for (const target of targets) {
			if (target === source) throw new Error(`Cannot restore parallel target '${target}' because it is also the selected source.`);
			if (!fields.has(target)) throw new Error(`Cannot restore parallel target '${target}' because it is not present in the current field options.`);
		}
		const activeFields = [source, ...targets].filter((fieldId): fieldId is string => fieldId != null);
		const supportedKeys = new Set(['source', 'targets', 'align', ...activeFields.map(childPersistKey)]);
		const unknownKeys = Object.keys(restored).filter(key => !supportedKeys.has(key));
		if (unknownKeys.length) throw new Error(`Cannot restore parallel field with unsupported keys: ${unknownKeys.join(', ')}.`);
		const childStates = Object.fromEntries(
			activeFields.map(fieldId => {
				const childPayload = restored[childPersistKey(fieldId)];
				return [fieldId, childPayload == null ? createDefaultParallelChildState(config, runtime) : config.childFieldTemplate.controller.restore(childPayload, config.childFieldTemplate, runtime)];
			}),
		);
		return {
			source: source ?? null,
			targets,
			alignBy: restored.align ?? defaults.alignBy,
			childStates,
		};
	},
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
