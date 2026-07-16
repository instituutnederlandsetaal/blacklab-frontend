import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { buildQueryIR } from '@/features/form/model/compile';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { expertQueryController } from '@/features/form/model/controllers';
import { findPathToNode, getAllNodes, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import { createDefaultFormState, createFormStateSnapshot, type DeepReadonly, type FormStateInput, type NewFormState } from '@/features/form/model/state';
import { NATIVE_BLACKLAB_PARAMETERS, type BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type { EncodedFieldValue, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormStateWithSummaries, ScopedFormQuery } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

export const FORM_QUERY_PREFIX = 'f.';
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
type DecodedScopedFormParams = {
	formSelector: DecodedScopedParameter;
	tabSelections: DecodedScopedParameter;
	fields: ReadonlyMap<string, EncodedFieldValue | undefined>;
};

type FieldCodecEntry = {
	field: FormFieldNode;
	key: string;
};

type RestoreTarget = {
	form: FormBoundaryNode;
	selectedFormId: string | null;
	issues: RestoreIssue[];
};

function isNonEmpty(value: string | null | undefined): value is string {
	return value != null && value !== '';
}

function asArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
	return typeof value === 'string' ? [value] : [];
}

function first(value: unknown): string | null {
	return asArray(value)[0] ?? null;
}

function stripPrefix(key: string): string | null {
	return key.startsWith(FORM_QUERY_PREFIX) ? key.slice(FORM_QUERY_PREFIX.length) : null;
}

export function isReservedScopedFormKey(key: string): boolean {
	return RESERVED_SCOPED_FORM_KEYS.has(key);
}

function findExpertForm(definition: FormBuilder): { form: FormBoundaryNode; field: FormFieldNode } | null {
	for (const form of definition.formsList) {
		for (const f of walkFormNodes(form, 'field')) {
			if (f.controller.kind === expertQueryController.kind) return { form, field: f };
		}
	}
	return null;
}

function buildFieldCodec(form: FormNode, context: FormRuntimeContext): { entries: FieldCodecEntry[]; issues: RestoreIssue[] } {
	const seen = new Map<string, FormFieldNode>();
	const entries: FieldCodecEntry[] = [];
	const issues: RestoreIssue[] = [];

	for (const field of getAllNodes(form, 'field')) {
		const key = field.controller.getPersistKey(field, context);
		if (isReservedScopedFormKey(key)) {
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
			const persistKey = node.controller.getPersistKey(node, definition.context);
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

function getDefaultUiState(definition: FormBuilder): Record<string, string | null> {
	return Object.fromEntries(definition.containerList.map(container => [container.id, container.children[0]?.id ?? null]));
}

function takeScopedParameter(fields: Map<string, EncodedFieldValue | undefined>, key: string): DecodedScopedParameter {
	if (!fields.has(key)) return { present: false };
	const value = fields.get(key);
	fields.delete(key);
	return { present: true, value };
}

/** Decode the form-owned URL parameters and separate control parameters from field values. */
function decodeScopedFormParams(query: Record<string, unknown>): DecodedScopedFormParams {
	const fields = new Map<string, EncodedFieldValue | undefined>();
	for (const [key, value] of Object.entries(query)) {
		if (!key.startsWith(FORM_QUERY_PREFIX)) continue;
		const unscoped = stripPrefix(key);
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

function fieldRestoreIssue(entry: FieldCodecEntry, message: string): RestoreIssue {
	return { key: entry.key, nodeId: entry.field.id, message };
}

function decodeFieldState(entry: FieldCodecEntry, payload: EncodedFieldValue, context: FormRuntimeContext): { restored: true; state: unknown } | { restored: false; issue: RestoreIssue } {
	try {
		return {
			restored: true,
			state: entry.field.controller.restore(payload, entry.field, context),
		};
	} catch (error) {
		return {
			restored: false,
			issue: fieldRestoreIssue(entry, error instanceof Error ? error.message : `Could not restore field '${entry.field.id}'.`),
		};
	}
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

		const decoded = decodeFieldState(entry, payload, context);
		if (decoded.restored) state[entry.field.id] = decoded.state;
		else issues.push(decoded.issue);
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

function selectRestoreForm(definition: FormBuilder, formSelector: DecodedScopedParameter): RestoreTarget {
	const requestedFormId = formSelector.present ? first(formSelector.value) : null;
	const form = definition.formsMap[requestedFormId ?? ''] ?? definition.formsList[0];
	if (!form) throw new Error('Cannot restore form state because the form builder has no form nodes.');

	if (!formSelector.present) return { form, selectedFormId: null, issues: [] };
	if (requestedFormId === form.id) return { form, selectedFormId: requestedFormId, issues: [] };

	return {
		form,
		selectedFormId: null,
		issues: [
			{
				key: SCOPED_FORM_KEYS.formSelector,
				message: requestedFormId ? `No current form accepts persisted selector '${requestedFormId}'.` : 'Persisted form selector has no value.',
			},
		],
	};
}

function selectExpertFallback(definition: FormBuilder, canonicalPattern: string | null | undefined, hasUsableScopedState: boolean) {
	return !hasUsableScopedState && isNonEmpty(canonicalPattern) ? findExpertForm(definition) : null;
}

function findUnrepresentableCanonicalParams(compiledParams: BlackLabParameters, canonicalParams: BlackLabParameters): BlackLabParameters {
	const overrides: BlackLabParameters = {};
	for (const parameter of NATIVE_BLACKLAB_PARAMETERS) {
		const canonicalValue = canonicalParams[parameter];
		if (isNonEmpty(canonicalValue) && compiledParams[parameter] !== canonicalValue) overrides[parameter] = canonicalValue;
	}
	return overrides;
}

function buildRestoredUiState(
	definition: FormBuilder,
	persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>,
	selectedFormId: string | null,
	persistedTabs: Record<string, string>,
	expertForm: FormBoundaryNode | null,
): Record<string, string | null> {
	return {
		...getDefaultUiState(definition),
		...inferUiStateFromPersistedFields(definition, persistedFields),
		...(selectedFormId ? getUiStateForPath([definition.getRoot()], selectedFormId) : {}),
		...persistedTabs,
		...(expertForm ? getUiStateForPath([definition.getRoot()], expertForm.id) : {}),
	};
}

function queryAffectingTabParams(form: FormNode, state: FormStateInput): string[] {
	const tabs: string[] = [];
	for (const container of getAllNodes(form, 'container', 'form')) {
		if (!container.children.some(child => isContainerNode(child) && child.activeQueryContribution)) continue;
		const activeChildId = state.uiState[container.id];
		const activeChild = container.children.find(child => child.id === activeChildId);
		if (!activeChild || !isContainerNode(activeChild) || !activeChild.activeQueryContribution) continue;
		tabs.push(`${container.id}:${activeChild.id}`);
	}
	return tabs;
}

function encodeScopedFormState(form: FormNode, context: FormRuntimeContext, state: FormStateInput): { encoded: ScopedFormQuery; issues?: RestoreIssue[] } {
	const codec = buildFieldCodec(form, context);
	const values = codec.entries
		.map(({ field, key }) => ({ key, state: field.controller.encode(state.state[field.id], field, context) }))
		.filter(({ state }) => state != null && (Array.isArray(state) ? state.length > 0 : state !== ''));
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
	const { query, summaries } = buildQueryIR(node, state, context);
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
		summaries,
	};
}

export function restoreFormState(definition: FormBuilder, query: Record<string, unknown>): RestoredFormState {
	const scopedParams = decodeScopedFormParams(query);
	const canonicalParams = decodeCanonicalFormParams(query, definition.context);
	const target = selectRestoreForm(definition, scopedParams.formSelector);
	const defaults = createDefaultFormState(definition.context, ...definition.nodeList);
	const codec = buildFieldCodec(target.form, definition.context);
	const restoredFields = restorePersistedFields(codec.entries, scopedParams.fields, definition.context);
	const persistedTabs = decodePersistedTabSelections(definition, scopedParams.tabSelections);
	const hasUsableScopedState = Object.keys(restoredFields.state).length > 0 || Object.keys(persistedTabs.uiState).length > 0;
	const expertFallback = selectExpertFallback(definition, canonicalParams.patt, hasUsableScopedState);
	const formToCompile = expertFallback?.form ?? target.form;
	const restoredState: NewFormState = {
		state: {
			...defaults.state,
			...restoredFields.state,
			...(expertFallback ? { [expertFallback.field.id]: canonicalParams.patt } : {}),
		},
		uiState: buildRestoredUiState(definition, scopedParams.fields, target.selectedFormId, persistedTabs.uiState, expertFallback?.form ?? null),
		rawOverrides: {},
	};
	const compiledParams = compileQueryIR(buildQueryIR(formToCompile, restoredState, definition.context).query);
	const rawOverrides = findUnrepresentableCanonicalParams(compiledParams, canonicalParams);
	const issues = [...target.issues, ...codec.issues, ...restoredFields.issues, ...persistedTabs.issues, ...restoredFields.unrecognizedIssues];

	return createFormStateSnapshot({
		...restoredState,
		rawOverrides,
		issues,
		submittedFormId: expertFallback ? null : target.selectedFormId,
	});
}
