import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { buildQueryIR } from '@/features/form/model/compile';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { expertQueryController } from '@/features/form/model/controllers';
import { findPathToNode, getAllNodes, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import { createDefaultFormState, type NewFormState } from '@/features/form/model/state';
import { NATIVE_BLACKLAB_PARAMETERS, type BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type { EncodedFieldValue, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormStateWithSummaries, ScopedFormQuery } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

export const FORM_QUERY_PREFIX = 'f.';
const RESERVED_SCOPED_FORM_KEYS = new Set(['form', 'tab']);

export type RestoreIssue = {
	key?: string;
	nodeId?: string;
	message: string;
};

export type RestoredFormState = NewFormState & { issues: RestoreIssue[]; activeFormId: string | null | undefined };

type FieldCodecEntry = {
	field: FormFieldNode;
	key: string;
};

type ScopedQuery = ReturnType<typeof readScopedQuery>;
type RestoreTarget = {
	form: FormBoundaryNode;
	activeFormId: string | null;
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

function findExpertForm(builder: FormBuilder): { form: FormBoundaryNode; field: FormFieldNode } | null {
	for (const form of builder.formsList.value) {
		const field = Array.from(walkFormNodes(form, 'field')).find(f => f.controller.kind === expertQueryController.kind);
		if (field) return { form, field };
	}
	return null;
}

function buildFieldCodec(form: FormNode, context: FormRuntimeContext, issues: RestoreIssue[]): FieldCodecEntry[] {
	const seen = new Map<string, FormFieldNode>();
	const entries: FieldCodecEntry[] = [];

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
	return entries;
}

function setActivePath(rootNodes: FormNode[], targetId: string, activeContainers: Record<string, string | null>): boolean {
	const path = findPathToNode(rootNodes, targetId);
	if (path) {
		for (let i = 0; i < path.length - 1; i++) {
			const containerId = path[i];
			const childId = path[i + 1];
			activeContainers[containerId] = childId;
		}
	}
	return !!path;
}

function valueDiffers(left: string | null | undefined, right: string | null | undefined): boolean {
	return (left ?? null) !== (right ?? null);
}

function hasPersistedValue(state: NewFormState, field: FormFieldNode, context: FormRuntimeContext): boolean {
	const current = state.state[field.id];
	const defaults = field.controller.createDefaultState(field, context);
	return JSON.stringify(current) !== JSON.stringify(defaults);
}

function inferActiveContainersFromValues(form: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, explicitActiveContainers = new Set<string>()) {
	const active = state.uiState;
	const descendantsWithValues = new Set<string>();
	for (const field of getAllNodes(form, 'field')) {
		if (hasPersistedValue(state, field, context)) descendantsWithValues.add(field.id);
	}

	function visit(node: FormNode): boolean {
		if (node.kind === 'field') return descendantsWithValues.has(node.id);
		if (!isContainerNode(node)) return false;
		let firstActiveChild: string | null = null;
		for (const child of node.children) {
			if (visit(child) && !firstActiveChild) firstActiveChild = child.id;
		}
		if (firstActiveChild && !explicitActiveContainers.has(node.id)) active[node.id] = firstActiveChild;
		return !!firstActiveChild;
	}

	visit(form);
}

/**
 * Read the parameters that belong to the form state from a browser query params object.
 * Does not read the canonical BlackLab parameters, which are handled separately.
 *
 * Returns the params stripped of the form query prefix, and a set of the keys that were found.
 */
function readScopedQuery(query: Record<string, unknown>): { keys: Set<string>; values: Record<string, EncodedFieldValue> } {
	const keys = new Set<string>();
	const scoped: Record<string, EncodedFieldValue> = {};
	for (const [key, value] of Object.entries(query)) {
		const unscoped = stripPrefix(key);
		if (!unscoped) continue;
		keys.add(unscoped);
		const values = asArray(value);
		if (!values.length) continue;
		scoped[unscoped] = values.length === 1 ? values[0] : values;
	}
	return { keys, values: scoped };
}

/** Read the canonical BlackLab parameters (the compiled BlackLab query) from a browser query params object. */
function readCanonicalQuery(query: Record<string, unknown>): BlackLabParameters {
	const canonical: BlackLabParameters = {};
	for (const param of NATIVE_BLACKLAB_PARAMETERS) {
		if (param in query && typeof query[param] === 'string' && query[param]) canonical[param] = query[param] as string;
	}
	return canonical;
}

function restoreField(entry: FieldCodecEntry, payload: EncodedFieldValue, context: FormRuntimeContext, state: NewFormState, issues: RestoreIssue[]): boolean {
	if (!entry.field.controller.restore) {
		issues.push({
			key: entry.key,
			nodeId: entry.field.id,
			message: `Field '${entry.field.id}' cannot restore persisted value '${entry.key}'.`,
		});
		return false;
	}
	try {
		const restored = entry.field.controller.restore(payload, entry.field, context);
		if (restored && typeof restored === 'object' && 'state' in restored) {
			state.state[entry.field.id] = restored.state;
			for (const warning of restored.warnings ?? []) issues.push({ key: entry.key, nodeId: entry.field.id, message: warning });
			for (const error of restored.errors ?? []) issues.push({ key: entry.key, nodeId: entry.field.id, message: error });
		} else {
			state.state[entry.field.id] = restored;
		}
		return true;
	} catch (error) {
		issues.push({
			key: entry.key,
			nodeId: entry.field.id,
			message: error instanceof Error ? error.message : `Could not restore field '${entry.field.id}'.`,
		});
		return false;
	}
}

function applyTabState(form: FormBoundaryNode, payload: EncodedFieldValue | undefined, state: NewFormState, issues: RestoreIssue[]): Set<string> {
	const explicitActiveContainers = new Set<string>();
	for (const tab of asArray(payload)) {
		const [containerKey, childKey] = tab.split(':');
		if (!containerKey || !childKey || tab.split(':').length !== 2) {
			issues.push({ key: 'tab', message: `Invalid persisted tab selection '${tab}'.` });
			continue;
		}
		const container = getAllNodes(form, 'container', 'form').find(node => node.id === containerKey);
		if (!container) {
			issues.push({ key: 'tab', message: `No current form container accepts persisted tab key '${containerKey}'.` });
			continue;
		}
		const child = container.children.find(child => child.id === childKey);
		if (!child) {
			issues.push({ key: 'tab', nodeId: container.id, message: `No child '${childKey}' exists in persisted tab container '${containerKey}'.` });
			continue;
		}
		state.uiState[container.id] = child.id;
		explicitActiveContainers.add(container.id);
	}
	return explicitActiveContainers;
}

function resolveRestoreTarget(builder: FormBuilder, scoped: ScopedQuery, issues: RestoreIssue[]): RestoreTarget {
	const requestedFormId = first(scoped.values.form);
	const form = builder.formsMap.value[requestedFormId ?? ''] ?? builder.formsList.value[0];
	if (!form) throw new Error('Cannot restore form state because the form builder has no form nodes.');

	if (!scoped.keys.has('form')) return { form, activeFormId: null };
	if (requestedFormId === form.id) return { form, activeFormId: requestedFormId };

	issues.push({
		key: 'form',
		message: requestedFormId ? `No current form accepts persisted selector '${requestedFormId}'.` : 'Persisted form selector has no value.',
	});
	return { form, activeFormId: null };
}

function restoreScopedValues(form: FormBoundaryNode, scoped: ScopedQuery, context: FormRuntimeContext, state: NewFormState, issues: RestoreIssue[]) {
	const consumed = new Set<string>(scoped.keys.has('form') ? ['form'] : []);
	let hasUsableState = false;
	const codec = buildFieldCodec(form, context, issues);

	for (const entry of codec) {
		if (!scoped.keys.has(entry.key)) continue;
		consumed.add(entry.key);
		const payload = scoped.values[entry.key];
		if (payload == null) {
			issues.push({ key: entry.key, nodeId: entry.field.id, message: `Persisted field '${entry.key}' has no value.` });
			continue;
		}
		if (restoreField(entry, payload, context, state, issues)) hasUsableState = true;
	}

	let explicitActiveContainers = new Set<string>();
	if (scoped.keys.has('tab')) {
		consumed.add('tab');
		if (scoped.values.tab == null) issues.push({ key: 'tab', message: 'Persisted tab selection has no value.' });
		else {
			explicitActiveContainers = applyTabState(form, scoped.values.tab, state, issues);
			if (explicitActiveContainers.size > 0) hasUsableState = true;
		}
	}

	for (const key of scoped.keys) {
		if (!consumed.has(key)) issues.push({ key, message: `No current form field accepts persisted key '${key}'.` });
	}

	return { hasUsableState, explicitActiveContainers };
}

function applyCanonicalFallback(builder: FormBuilder, form: FormBoundaryNode, hasUsableScopedState: boolean, canonical: BlackLabParameters, state: NewFormState): FormBoundaryNode {
	const expert = findExpertForm(builder);
	if (hasUsableScopedState || !isNonEmpty(canonical.patt) || !expert) return form;

	setActivePath([builder.getRoot()], expert.form.id, state.uiState);
	state.state[expert.field.id] = canonical.patt;
	return expert.form;
}

function applyRawOverrides(form: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, canonical: BlackLabParameters): void {
	const compiled = compileQueryIR(buildQueryIR(form, state, context).query);
	for (const parameter of NATIVE_BLACKLAB_PARAMETERS) {
		const canonicalValue = canonical[parameter];
		if (valueDiffers(compiled[parameter], canonicalValue)) state.rawOverrides[parameter] = canonicalValue ?? null;
		if (!isNonEmpty(state.rawOverrides[parameter])) delete state.rawOverrides[parameter];
	}
}

function queryAffectingTabParams(form: FormNode, state: NewFormState): string[] {
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

function encodeScopedFormState(form: FormNode, context: FormRuntimeContext, state: NewFormState): { encoded: ScopedFormQuery; issues?: RestoreIssue[] } {
	const issues: RestoreIssue[] = [];
	const values = buildFieldCodec(form, context, issues)
		.map(({ field, key }) => ({ key, state: field.controller.encode(state.state[field.id], field, context) }))
		.filter(({ state }) => state != null && (Array.isArray(state) ? state.length > 0 : state !== ''));
	const r: ScopedFormQuery = {
		[`${FORM_QUERY_PREFIX}form`]: form.id,
	};
	for (const { key, state } of values) r[`${FORM_QUERY_PREFIX}${key}`] = state!;
	const tabs = queryAffectingTabParams(form, state);
	if (tabs.length) r[`${FORM_QUERY_PREFIX}tab`] = tabs;
	return { encoded: r, issues: issues.length ? issues : undefined };
}

export function hasScopedFormState(query: Record<string, unknown>): boolean {
	for (const key in query) {
		if (Object.prototype.hasOwnProperty.call(query, key) && key.startsWith(FORM_QUERY_PREFIX)) return true;
	}
	return false;
}

export function compileFormNode(node: FormNode, state: NewFormState, context: FormRuntimeContext): CompiledFormStateWithSummaries {
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

export function restoreScopedFormState(builder: FormBuilder, query: Record<string, unknown>, canonical: BlackLabParameters = {}): RestoredFormState {
	const issues: RestoreIssue[] = [];
	const scoped = readScopedQuery(query);
	const canonicalParameters = { ...readCanonicalQuery(query), ...canonical };
	const target = resolveRestoreTarget(builder, scoped, issues);
	const state = createDefaultFormState(builder.context, ...(builder.nodeList.value as FormNode[]));
	setActivePath([builder.getRoot()], target.form.id, state.uiState);
	const restored = restoreScopedValues(target.form, scoped, builder.context, state, issues);
	const form = applyCanonicalFallback(builder, target.form, restored.hasUsableState, canonicalParameters, state);
	inferActiveContainersFromValues(form, state, builder.context, restored.explicitActiveContainers);
	applyRawOverrides(form, state, builder.context, canonicalParameters);

	return {
		...state,
		issues,
		activeFormId: target.activeFormId,
	};
}
