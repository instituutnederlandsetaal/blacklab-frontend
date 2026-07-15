import type {
	ParallelAnnotatedField,
	ParallelFieldConfig,
	ParallelFieldDefinition,
	ParallelFieldState,
} from '@/features/form/fields/parallel-field';
import { queryFragment, queryIR } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, encodePersistObject, joinPersistValues, splitPersistValue } from '@/features/form/model/controllers/persistence-codec';
import { defineFieldController, type EncodedFieldValue, type FieldController, type FieldControllerProps, type FormRuntimeContext, type RestoreFieldResult } from '@/features/form/model/types/form-controllers';
import type { CqlPattern, SummaryEntry } from '@/features/form/model/types/form-query';

import { findOption, optionValue } from '@/shared/utils/options';

type ParallelChildNamespace = { scope: 'source' } | { scope: 'target'; fieldId: string };
type DecodedChildPersistKey = ParallelChildNamespace & { persistKey: string };

const CHILD_KEY_SEPARATOR = '.';
const SOURCE_CHILD_SCOPE = 'source';
const TARGET_CHILD_SCOPE = 'target';

function translatedAnnotatedField(runtime: Parameters<NonNullable<FieldController['getQueryContribution']>>[1], field: ParallelAnnotatedField) {
	return runtime.translate.$tAnnotatedFieldDisplayName(field);
}

function translatedAlignBy(config: FieldControllerProps<ParallelFieldConfig>, runtime: Parameters<NonNullable<FieldController['getQueryContribution']>>[1], alignBy: string) {
	return runtime.translate.$tAlignByDisplayName(findOption(config.alignByOptions ?? [], alignBy) ?? { value: alignBy });
}

function encodeChildNamespaceSegment(value: string, label: string) {
	if (!value) throw new Error(`Cannot encode empty parallel child ${label}.`);
	return encodeURIComponent(value).replace(/\./g, '%2E');
}

function decodeChildNamespaceSegment(value: string): string | null {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function childStateKey(namespace: ParallelChildNamespace): string {
	return namespace.scope === SOURCE_CHILD_SCOPE ? SOURCE_CHILD_SCOPE : namespace.fieldId;
}

function childFieldId(config: FieldControllerProps<ParallelFieldConfig>, namespace: ParallelChildNamespace) {
	return `${config.id}${CHILD_KEY_SEPARATOR}${childStateKey(namespace)}${CHILD_KEY_SEPARATOR}${config.child.id}`;
}

function encodeChildPersistKey(namespace: ParallelChildNamespace, persistKey: string): string {
	const encodedPersistKey = encodeChildNamespaceSegment(persistKey, 'persist key');
	if (namespace.scope === SOURCE_CHILD_SCOPE) return [SOURCE_CHILD_SCOPE, encodedPersistKey].join(CHILD_KEY_SEPARATOR);
	return [TARGET_CHILD_SCOPE, encodeChildNamespaceSegment(namespace.fieldId, 'target field id'), encodedPersistKey].join(CHILD_KEY_SEPARATOR);
}

function decodeChildPersistKey(key: string): DecodedChildPersistKey | null {
	const parts = key.split(CHILD_KEY_SEPARATOR);
	if (parts.length === 1) return null;
	if (parts[0] === SOURCE_CHILD_SCOPE && parts.length === 2 && parts[1]) {
		const persistKey = decodeChildNamespaceSegment(parts[1]);
		return persistKey ? { scope: SOURCE_CHILD_SCOPE, persistKey } : { scope: TARGET_CHILD_SCOPE, fieldId: '', persistKey: '' };
	}
	if (parts[0] === TARGET_CHILD_SCOPE && parts.length === 3 && parts[1] && parts[2]) {
		const fieldId = decodeChildNamespaceSegment(parts[1]);
		const persistKey = decodeChildNamespaceSegment(parts[2]);
		return fieldId && persistKey ? { scope: TARGET_CHILD_SCOPE, fieldId, persistKey } : { scope: TARGET_CHILD_SCOPE, fieldId: '', persistKey: '' };
	}
	if (parts[0] === SOURCE_CHILD_SCOPE || parts[0] === TARGET_CHILD_SCOPE) {
		return { scope: TARGET_CHILD_SCOPE, fieldId: '', persistKey: '' };
	}
	return null;
}

function createChildFieldConfig(config: FieldControllerProps<ParallelFieldConfig>, namespace: ParallelChildNamespace): FieldControllerProps<any> {
	return {
		...config.child.config,
		id: childFieldId(config, namespace),
		kind: 'field',
		variant: (config.child.config as { variant?: FieldControllerProps<ParallelFieldConfig>['variant'] }).variant ?? config.variant,
	};
}

function createDefaultChildState(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, namespace: ParallelChildNamespace = { scope: SOURCE_CHILD_SCOPE }) {
	return config.child.controller.createDefaultState(createChildFieldConfig(config, namespace), runtime);
}

function createDefaultParallelFieldState(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext): ParallelFieldState {
	return {
		source: config.defaultSource ?? null,
		targets: [],
		alignBy: config.defaultAlignBy ?? (config.alignByOptions?.[0] ? optionValue(config.alignByOptions[0]) : null),
		sourceState: createDefaultChildState(config, runtime, { scope: SOURCE_CHILD_SCOPE }),
		targetStates: {},
	};
}

function containsParallelPattern(pattern: CqlPattern | null): boolean {
	if (!pattern) return false;
	if (pattern.type === 'parallel') return true;
	if (pattern.type === 'and' || pattern.type === 'or' || pattern.type === 'sequence') return pattern.children.some(containsParallelPattern);
	return false;
}

function getChildPattern(config: FieldControllerProps<ParallelFieldConfig>, runtime: FormRuntimeContext, state: unknown, namespace: ParallelChildNamespace): CqlPattern | null {
	const childConfig = createChildFieldConfig(config, namespace);
	const pattern = config.child.controller.getQueryContribution(childConfig, runtime, state).query.pattern;
	if (containsParallelPattern(pattern)) {
		console.warn(`Parallel field '${config.id}' ignored nested parallel child contribution from '${childConfig.id}'.`);
		return null;
	}
	return pattern;
}

function encodedValueToNestedValue(value: EncodedFieldValue | null | undefined): string | undefined {
	if (value == null || value === '') return undefined;
	if (Array.isArray(value)) return value.length ? joinPersistValues(value) : undefined;
	return value;
}

function isRestoreObject<State>(result: RestoreFieldResult<State>): result is { state: State; warnings?: string[]; errors?: string[] } {
	return !!result && typeof result === 'object' && 'state' in result;
}

type RestoreMessages = { warnings: string[]; errors: string[] };

function restoredState<State>(result: RestoreFieldResult<State>, messages: RestoreMessages): State {
	if (isRestoreObject(result)) {
		messages.warnings.push(...(result.warnings ?? []));
		messages.errors.push(...(result.errors ?? []));
		return result.state;
	}
	return result;
}

export const parallelController = defineFieldController<'parallel', ParallelFieldDefinition>({
	kind: 'parallel',
	createDefaultState: createDefaultParallelFieldState,
	getPersistKey: () => 'parallel',
	affectsBlackLabParameters: ['searchfield', 'patt'],
	encode(state, config, runtime) {
		const defaultState = createDefaultParallelFieldState(config, runtime);
		const sourceNamespace: ParallelChildNamespace = { scope: SOURCE_CHILD_SCOPE };
		const sourceChildConfig = createChildFieldConfig(config, sourceNamespace);
		const childPersistKey = config.child.controller.getPersistKey(sourceChildConfig, runtime);
		const values: Record<string, string | null | undefined> = {
			source: state.source !== defaultState.source ? state.source : undefined,
			targets: state.targets.length ? joinPersistValues(state.targets) : undefined,
			align: state.alignBy !== defaultState.alignBy ? state.alignBy : undefined,
			[encodeChildPersistKey(sourceNamespace, childPersistKey)]: encodedValueToNestedValue(config.child.controller.encode(state.sourceState, sourceChildConfig, runtime)),
		};

		for (const target of state.targets) {
			const targetState = state.targetStates[target];
			if (targetState == null) continue;
			const targetNamespace: ParallelChildNamespace = { scope: TARGET_CHILD_SCOPE, fieldId: target };
			const targetChildConfig = createChildFieldConfig(config, targetNamespace);
			const targetPersistKey = config.child.controller.getPersistKey(targetChildConfig, runtime);
			values[encodeChildPersistKey(targetNamespace, targetPersistKey)] = encodedValueToNestedValue(config.child.controller.encode(targetState, targetChildConfig, runtime));
		}

		return encodePersistObject(values);
	},
	restore(payload, config, runtime) {
		const restored = decodePersistObject(payload);
		const defaults = createDefaultParallelFieldState(config, runtime);
		const messages: RestoreMessages = { warnings: [], errors: [] };
		const fieldOptionIds = new Set(config.fieldOptions.map(option => option.id));
		const sourceNamespace: ParallelChildNamespace = { scope: SOURCE_CHILD_SCOPE };
		const sourceChildConfig = createChildFieldConfig(config, sourceNamespace);
		const childPersistKey = config.child.controller.getPersistKey(sourceChildConfig, runtime);
		const selectedTargets = splitPersistValue(restored.targets ?? '').filter(Boolean);
		const validTargets = selectedTargets.filter(target => {
			const valid = fieldOptionIds.has(target);
			if (!valid) messages.warnings.push(`Dropped restored target '${target}' because it is no longer present in the current parallel target options.`);
			return valid;
		});
		const targetStates: Record<string, unknown> = {};
		let sourceState = defaults.sourceState;

		for (const key of Object.keys(restored)) {
			const decoded = decodeChildPersistKey(key);
			if (!decoded) continue;
			if (!decoded.persistKey) {
				messages.warnings.push(`Ignored malformed restored parallel child key '${key}'.`);
				continue;
			}

			if (decoded.scope === SOURCE_CHILD_SCOPE) {
				if (decoded.persistKey !== childPersistKey) {
					messages.warnings.push(`Ignored unsupported restored parallel source key '${key}'.`);
					continue;
				}
				sourceState = restoredState(config.child.controller.restore(restored[key], sourceChildConfig, runtime), messages);
				continue;
			}

			if (!fieldOptionIds.has(decoded.fieldId)) {
				messages.warnings.push(`Dropped restored target state for '${decoded.fieldId}' because it is no longer present in the current parallel target options.`);
				continue;
			}
			if (decoded.persistKey !== childPersistKey) {
				messages.warnings.push(`Ignored unsupported restored parallel target key '${key}'.`);
				continue;
			}
			targetStates[decoded.fieldId] = restoredState(config.child.controller.restore(restored[key], createChildFieldConfig(config, decoded), runtime), messages);
		}

		const state = {
			source: restored.source ?? defaults.source,
			targets: validTargets,
			alignBy: restored.align ?? defaults.alignBy,
			sourceState,
			targetStates,
		};
		return messages.warnings.length || messages.errors.length
			? {
					state,
					warnings: messages.warnings.length ? messages.warnings : undefined,
					errors: messages.errors.length ? messages.errors : undefined,
				}
			: state;
	},
	getQueryContribution(config, runtime, state) {
		const selectedTargetPatterns = state.targets.map(fieldId => {
			const targetNamespace: ParallelChildNamespace = { scope: TARGET_CHILD_SCOPE, fieldId };
			const targetState = state.targetStates[fieldId] ?? createDefaultChildState(config, runtime, targetNamespace);
			return {
				fieldId,
				relationType: state.alignBy,
				pattern: getChildPattern(config, runtime, targetState, targetNamespace),
			};
		});
		const sourcePattern = getChildPattern(config, runtime, state.sourceState, { scope: SOURCE_CHILD_SCOPE });
		const query = queryIR({
			searchfield: state.source,
			pattern: selectedTargetPatterns.length
				? {
						type: 'parallel',
						source: sourcePattern,
						targets: selectedTargetPatterns,
					}
				: sourcePattern,
		});
		const summaries: SummaryEntry[] = [];
		if (state.source)
			summaries.push({
				id: `${config.id}.source`,
				label: runtime.translate.$t(`search.parallel.searchSourceVersion`),
				value: translatedAnnotatedField(runtime, config.fieldOptions.find(field => field.id === state.source) ?? { id: state.source }),
			});
		if (state.targets.length)
			summaries.push({
				id: `${config.id}.targets`,
				label: runtime.translate.$t(`search.parallel.andCompareWithTargetVersions`),
				value: state.targets.map(target => translatedAnnotatedField(runtime, config.fieldOptions.find(field => field.id === target) ?? { id: target })).join(', '),
			});
		if (state.alignBy)
			summaries.push({
				id: `${config.id}.alignBy`,
				label: runtime.translate.$t(`search.parallel.alignBy`),
				value: translatedAlignBy(config, runtime, state.alignBy),
			});
		return queryFragment({ query, summaries });
	},
});
