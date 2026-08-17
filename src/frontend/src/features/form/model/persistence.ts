import type { ParallelFieldConfig } from '@/features/form/fields/parallel-field';
import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { buildQueryIR } from '@/features/form/model/compile';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { expertQueryController, parallelController, restoreCanonicalPatternInExpertField, restoreCanonicalPatternInParallelField } from '@/features/form/model/controllers';
import { findPathToNode, getAllNodes, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import { createDefaultFormState, createFormStateSnapshot, type FormStateInput, type NewFormState } from '@/features/form/model/state';
import { NATIVE_BLACKLAB_PARAMETERS, type BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import { encodeFieldState, getFieldPersistKey, restoreFieldState, type EncodedFieldValue, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormStateWithSummaries, ScopedFormQuery } from '@/features/form/model/types/form-query-ir';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';
import type { DeepReadonly } from '@/types/apptypes';

const FORM_QUERY_PREFIX = 'f.';
const SCOPED_FORM_KEYS = {
	formSelector: 'form',
	tabSelections: 'tab',
} as const;
const RESERVED_SCOPED_FORM_KEYS: ReadonlySet<string> = new Set(Object.values(SCOPED_FORM_KEYS));

export type RestoreIssue = {
	key?: string;
	nodeId?: string;
	message: string;
};

type MutableRestoredFormState = NewFormState & {
	issues: RestoreIssue[];
	/** Scoped form that can be compiled as the submitted query; canonical-only fallback stays null. */
	submittedFormId: string | null;
};
export type RestoredFormState = DeepReadonly<MutableRestoredFormState>;

type DecodedScopedParameter = { present: false } | { present: true; value: EncodedFieldValue | undefined };

type FieldCodecEntry = {
	field: FormFieldNode;
	key: string;
};

function isNonEmpty(value: string | null | undefined): value is string {
	return value != null && value !== '';
}

function asArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
	return typeof value === 'string' ? [value] : [];
}

function findExpertFallback(definition: FormBuilder, canonicalPattern: string, canonicalSearchfield: string | null | undefined): { form: FormBoundaryNode; fieldId: string; state: unknown } | null {
	for (const form of definition.formsList) {
		for (const f of walkFormNodes(form, 'field')) {
			if (f.controller.kind === expertQueryController.kind) return { form, fieldId: f.id, state: restoreCanonicalPatternInExpertField(canonicalPattern) };
			if (f.controller.kind !== parallelController.kind) continue;

			const parallelField = f as FormFieldNode & ParallelFieldConfig;
			if (parallelField.childFieldTemplate.controller.kind !== expertQueryController.kind) continue;
			const state = restoreCanonicalPatternInParallelField(parallelField, definition.context, canonicalPattern, canonicalSearchfield);
			if (!state) continue;
			return {
				form,
				fieldId: f.id,
				state,
			};
		}
	}
	return null;
}

function buildFieldCodec(form: FormNode, context: FormRuntimeContext): { entries: FieldCodecEntry[]; issues: RestoreIssue[] } {
	const seen = new Map<string, FormFieldNode>();
	const entries: FieldCodecEntry[] = [];
	const issues: RestoreIssue[] = [];

	for (const field of getAllNodes(form, 'field')) {
		const key = getFieldPersistKey(field, context);
		if (RESERVED_SCOPED_FORM_KEYS.has(key)) {
			issues.push({
				key,
				nodeId: field.id,
				message: `Field '${field.id}' uses reserved form persistence key '${key}'.`,
			});
			continue;
		}
		if (seen.has(key)) {
			issues.push({
				key,
				nodeId: field.id,
				message: `Duplicate form persistence key '${key}' for '${field.id}' and '${seen.get(key)!.id}'.`,
			});
			continue;
		}
		seen.set(key, field);
		entries.push({ field, key });
	}
	return { entries, issues };
}

function getUiStateForPath(rootNodes: FormNode[], targetId: string): Record<string, string> {
	const activeContainers: Record<string, string> = {};
	const path = findPathToNode(rootNodes, targetId);
	if (path) {
		for (let i = 0; i < path.length - 1; i++) {
			const containerId = path[i];
			const childId = path[i + 1];
			activeContainers[containerId] = childId;
		}
	}
	return activeContainers;
}

function inferUiStateFromPersistedFields(definition: FormBuilder, persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>): Record<string, string> {
	type PathEntry = { containerId: string; childId: string };
	const activeContainers: Record<string, string> = {};

	function visit(node: FormNode, path: PathEntry[]): void {
		if (node.kind === 'field') {
			const persistKey = getFieldPersistKey(node, definition.context);
			if (!persistedFields.has(persistKey)) return;

			for (const { containerId, childId } of path) {
				if (activeContainers[containerId] == null) activeContainers[containerId] = childId;
			}
			return;
		}
		if (!isContainerNode(node)) return;

		for (const child of node.children) {
			path.push({ containerId: node.id, childId: child.id });
			visit(child, path);
			path.pop();
		}
	}

	// Prefer paths through the canonical root. Builders can also contain reusable
	// subgraphs that are not attached there, so use every container as a fallback.
	visit(definition.getRoot(), []);
	for (const container of definition.containerList) visit(container, []);
	return activeContainers;
}

function takeScopedParameter(fields: Map<string, EncodedFieldValue | undefined>, key: string): DecodedScopedParameter {
	if (!fields.has(key)) return { present: false };
	const value = fields.get(key);
	fields.delete(key);
	return { present: true, value };
}

/** Decode the form-owned URL parameters and separate control parameters from field values. */
function decodeScopedFormParams(query: Record<string, unknown>) {
	const fields = new Map<string, EncodedFieldValue | undefined>();
	for (const [key, value] of Object.entries(query)) {
		if (!key.startsWith(FORM_QUERY_PREFIX)) continue;
		const unscoped = key.slice(FORM_QUERY_PREFIX.length);
		if (!unscoped) continue;
		const values = asArray(value);
		fields.set(unscoped, values.length ? (values.length === 1 ? values[0] : values) : undefined);
	}
	return {
		formSelector: takeScopedParameter(fields, SCOPED_FORM_KEYS.formSelector),
		tabSelections: takeScopedParameter(fields, SCOPED_FORM_KEYS.tabSelections),
		fields,
	};
}

function getFirstNonEmptyQueryValue(query: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = asArray(query[key]).find(isNonEmpty);
		if (value) return value;
	}
	return null;
}

function decodeCanonicalFormParams(query: Record<string, unknown>, context: FormRuntimeContext): BlackLabParameters {
	return {
		patt: getFirstNonEmptyQueryValue(query, 'patt', 'query'),
		filter: getFirstNonEmptyQueryValue(query, 'filter'),
		searchfield: context.corpus.isParallelCorpus === false ? null : getFirstNonEmptyQueryValue(query, 'searchfield', 'searchField', 'field'),
	};
}

function restorePersistedFields(entries: FieldCodecEntry[], persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>, context: FormRuntimeContext) {
	const state: Record<string, unknown> = {};
	const issues: RestoreIssue[] = [];
	const knownKeys = new Set(entries.map(entry => entry.key));

	for (const entry of entries) {
		if (!persistedFields.has(entry.key)) continue;
		const payload = persistedFields.get(entry.key);
		if (payload == null) {
			issues.push({ key: entry.key, nodeId: entry.field.id, message: `Persisted field '${entry.key}' has no value.` });
			continue;
		}

		try {
			state[entry.field.id] = restoreFieldState(entry.field, payload, context);
		} catch (error) {
			issues.push({
				key: entry.key,
				nodeId: entry.field.id,
				message: error instanceof Error ? error.message : `Could not restore field '${entry.field.id}'.`,
			});
		}
	}

	const unrecognizedIssues = [...persistedFields.keys()].filter(key => !knownKeys.has(key)).map(key => ({ key, message: `No current form field accepts persisted key '${key}'.` }));
	return { state, issues, unrecognizedIssues };
}

function decodePersistedTabSelections(definition: FormBuilder, persistedTabs: DecodedScopedParameter) {
	const uiState: Record<string, string> = {};
	const issues: RestoreIssue[] = [];
	if (!persistedTabs.present) return { uiState, issues };
	if (persistedTabs.value == null) {
		return { uiState, issues: [{ key: SCOPED_FORM_KEYS.tabSelections, message: 'Persisted tab selection has no value.' }] };
	}

	for (const tab of asArray(persistedTabs.value)) {
		const [containerKey, childKey] = tab.split(':');
		if (!containerKey || !childKey || tab.split(':').length !== 2) {
			issues.push({ key: SCOPED_FORM_KEYS.tabSelections, message: `Invalid persisted tab selection '${tab}'.` });
			continue;
		}
		const container = definition.getNode(containerKey);
		if (!isContainerNode(container)) {
			issues.push({ key: SCOPED_FORM_KEYS.tabSelections, message: `No current form container accepts persisted tab key '${containerKey}'.` });
			continue;
		}
		const child = container.children.find(child => child.id === childKey);
		if (!child) {
			issues.push({ key: SCOPED_FORM_KEYS.tabSelections, nodeId: container.id, message: `No child '${childKey}' exists in persisted tab container '${containerKey}'.` });
			continue;
		}
		uiState[container.id] = child.id;
	}
	return { uiState, issues };
}

function findUnrepresentableCanonicalParams(compiledParams: BlackLabParameters, canonicalParams: BlackLabParameters): BlackLabParameters {
	const overrides: BlackLabParameters = {};
	for (const parameter of NATIVE_BLACKLAB_PARAMETERS) {
		const canonicalValue = canonicalParams[parameter];
		if (isNonEmpty(canonicalValue) && compiledParams[parameter] !== canonicalValue) overrides[parameter] = canonicalValue;
	}
	return overrides;
}

function queryAffectingTabParams(form: FormNode, state: FormStateInput): string[] {
	const tabs: string[] = [];
	for (const container of getAllNodes(form, 'container', 'form')) {
		const activeChildId = state.uiState[container.id];
		const activeChild = container.children.find(child => child.id === activeChildId);
		if (!activeChild || !container.activeChildQueryContributions?.[activeChild.id]) continue;
		tabs.push(`${container.id}:${activeChild.id}`);
	}
	return tabs;
}

function encodeScopedFormState(form: FormNode, context: FormRuntimeContext, state: FormStateInput): { encoded: ScopedFormQuery; issues?: RestoreIssue[] } {
	const codec = buildFieldCodec(form, context);
	const values = codec.entries.map(({ field, key }) => ({ key, state: encodeFieldState(field, state.state[field.id], context) })).filter(({ state }) => state != null && state !== '');
	const r: ScopedFormQuery = {
		[`${FORM_QUERY_PREFIX}${SCOPED_FORM_KEYS.formSelector}`]: form.id,
	};
	for (const { key, state } of values) r[`${FORM_QUERY_PREFIX}${key}`] = state!;
	const tabs = queryAffectingTabParams(form, state);
	if (tabs.length) r[`${FORM_QUERY_PREFIX}${SCOPED_FORM_KEYS.tabSelections}`] = tabs;
	return { encoded: r, issues: codec.issues.length ? codec.issues : undefined };
}

export function compileFormNode(node: FormNode, state: FormStateInput, context: FormRuntimeContext): CompiledFormStateWithSummaries {
	if (node.kind !== 'form') console.warn(`Compiling state non-form node '${node.id}'.`);

	// Compile what's in the form
	const { encoded, issues } = encodeScopedFormState(node, context, state);
	const query = buildQueryIR(node, state, context);
	const compiled = compileQueryIR(query);
	// overwrite with raw overrides
	for (const parameter of NATIVE_BLACKLAB_PARAMETERS) {
		if (state.rawOverrides?.[parameter]) compiled[parameter] = state.rawOverrides[parameter];
	}

	return {
		...compiled,
		formId: node.id,
		encoded,
		issues,
		summaries: query.summaries,
	};
}

export function restoreFormState(definition: FormBuilder, query: Record<string, unknown>): RestoredFormState {
	if (!definition.formsList.length) throw new Error('Cannot restore form state because the form builder has no form nodes.');

	const scopedParams = decodeScopedFormParams(query);
	const canonicalParams = decodeCanonicalFormParams(query, definition.context);
	const requestedFormId = scopedParams.formSelector.present ? (asArray(scopedParams.formSelector.value)[0] ?? null) : null;
	const scopedForm = definition.formsMap[requestedFormId ?? ''] ?? definition.formsList[0];

	let submittedFormId: string | null = null;
	const formSelectorIssues: RestoreIssue[] = [];
	if (scopedParams.formSelector.present) {
		if (requestedFormId === scopedForm.id) submittedFormId = requestedFormId;
		else {
			formSelectorIssues.push({
				key: SCOPED_FORM_KEYS.formSelector,
				message: requestedFormId ? `No current form accepts persisted selector '${requestedFormId}'.` : 'Persisted form selector has no value.',
			});
		}
	}

	const defaults = createDefaultFormState(definition.context, ...definition.nodeList);
	const codec = buildFieldCodec(scopedForm, definition.context);
	const restoredFields = restorePersistedFields(codec.entries, scopedParams.fields, definition.context);
	const persistedTabs = decodePersistedTabSelections(definition, scopedParams.tabSelections);
	const issues = [...formSelectorIssues, ...codec.issues, ...restoredFields.issues, ...persistedTabs.issues, ...restoredFields.unrecognizedIssues];

	const finishRestore = (activeForm: FormBoundaryNode, finalSubmittedFormId: string | null, expertFallback: ReturnType<typeof findExpertFallback> = null): RestoredFormState => {
		const restoredState: NewFormState = {
			state: {
				...defaults.state,
				...restoredFields.state,
				...(expertFallback ? { [expertFallback.fieldId]: expertFallback.state } : {}),
			},
			uiState: {
				...Object.fromEntries(definition.containerList.map(container => [container.id, container.children[0]?.id ?? null])),
				...inferUiStateFromPersistedFields(definition, scopedParams.fields),
				...persistedTabs.uiState,
				...getUiStateForPath([definition.getRoot()], activeForm.id),
			},
			rawOverrides: {},
		};
		const compiledParams = compileQueryIR(buildQueryIR(activeForm, restoredState, definition.context));

		return createFormStateSnapshot({
			...restoredState,
			rawOverrides: findUnrepresentableCanonicalParams(compiledParams, canonicalParams),
			issues,
			submittedFormId: finalSubmittedFormId,
		});
	};

	// Restored fields or tabs make the scoped form authoritative.
	if (Object.keys(restoredFields.state).length > 0 || Object.keys(persistedTabs.uiState).length > 0) return finishRestore(scopedForm, submittedFormId);

	// Without a canonical pattern, there is nothing to restore into an expert field.
	if (!isNonEmpty(canonicalParams.patt)) return finishRestore(scopedForm, submittedFormId);

	// Canonical-only URLs use an expert form when the definition has a compatible field.
	const expertFallback = findExpertFallback(definition, canonicalParams.patt, canonicalParams.searchfield);
	if (!expertFallback) return finishRestore(scopedForm, submittedFormId);

	return finishRestore(expertFallback.form, null, expertFallback);
}
