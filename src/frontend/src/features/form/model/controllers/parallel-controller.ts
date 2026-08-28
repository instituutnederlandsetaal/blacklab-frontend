import {
	createDefaultParallelChildState,
	createDefaultParallelFieldState,
	parallelAnnotatedFieldLabel,
	type ParallelAnnotatedField,
	type ParallelFieldConfig,
	type ParallelFieldDefinition,
} from '@/features/form/fields/parallel-field';
import type { ParallelFieldState } from '@/features/form/fields/parallel-field';
import { combineCqlPatterns } from '@/features/form/model/compile/query-artifact';
import { array, object, record, scalar } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, encodeFieldState, gatherOutput, restoreFieldState, type FieldControllerProps, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { SummaryInput } from '@/features/form/model/types/form-output';
import { isCqlPatternNode, parallelQuery, parallelQueryTarget, type CqlPatternNode } from '@/features/form/model/types/form-query-ir';

import { findOption, optionLabel } from '@/shared/utils/options';

/** Apply the child template's default state before gathering a parallel branch. */
function getParallelChildPattern(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, state: unknown): CqlPatternNode | null {
	return combineCqlPatterns(gatherOutput(config.childFieldTemplate, state ?? createDefaultParallelChildState(config, runtime), runtime, 'patt', isCqlPatternNode), 'and');
}

function summarizeParallelChild(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, state: unknown, emit: (summary: SummaryInput) => void): void {
	config.childFieldTemplate.controller.summarize?.(config.childFieldTemplate, runtime, state ?? createDefaultParallelChildState(config, runtime), summary =>
		emit({
			...summary,
			summaryType: summary.summaryType ?? [...config.childFieldTemplate.controller.outputs],
		}),
	);
}

export function restoreCanonicalPatternInParallelField(
	config: FieldControllerProps<ParallelFieldConfig>,
	runtime: FormRuntimeContext,
	canonicalPattern: string,
	canonicalSearchfield: string | null | undefined,
): ParallelFieldState | null {
	const defaultState = createDefaultParallelFieldState(config, runtime);
	const source = config.fieldOptions.some(option => option.id === canonicalSearchfield) ? canonicalSearchfield : defaultState.source;
	if (!source) return null;
	return {
		...defaultState,
		source,
		childStates: { ...defaultState.childStates, [source]: canonicalPattern },
	};
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
	outputs: ['searchfield', 'patt'],
	collect(config, runtime, state, emit) {
		if (state.source) emit('searchfield', state.source);
		if (!state.source) return;
		const sourcePattern = getParallelChildPattern(config, runtime, state.childStates[state.source]);
		const targets = state.targets.map(fieldId => ({ fieldId, pattern: getParallelChildPattern(config, runtime, state.childStates[fieldId]) }));
		if (targets.length) {
			emit(
				'patt',
				parallelQuery(
					sourcePattern,
					targets.map(({ fieldId, pattern }) => parallelQueryTarget(fieldId, state.alignBy, pattern)),
				),
			);
		} else if (sourcePattern) emit('patt', sourcePattern);
	},
	summarize(config, runtime, state, emit) {
		if (state.source)
			emit({
				label: runtime.translate.$t(`search.parallel.searchSourceVersion`),
				value: parallelAnnotatedFieldLabel(config.fieldOptions.find(field => field.id === state.source) ?? { id: state.source }),
				summaryType: ['searchfield', 'patt'],
			});
		if (state.targets.length)
			emit({
				label: runtime.translate.$t(`search.parallel.andCompareWithTargetVersions`),
				value: state.targets.map(target => parallelAnnotatedFieldLabel(config.fieldOptions.find(field => field.id === target) ?? { id: target })).join(', '),
				summaryType: ['searchfield', 'patt'],
			});
		if (state.alignBy) {
			const alignBy = findOption(config.alignByOptions ?? [], state.alignBy) ?? state.alignBy;
			emit({
				label: runtime.translate.$t(`search.parallel.alignBy`),
				value: optionLabel(alignBy),
				summaryType: ['searchfield', 'patt'],
			});
		}

		if (state.source) summarizeParallelChild(config, runtime, state.childStates[state.source], emit);
		for (const fieldId of state.targets) summarizeParallelChild(config, runtime, state.childStates[fieldId], emit);
	},
});
