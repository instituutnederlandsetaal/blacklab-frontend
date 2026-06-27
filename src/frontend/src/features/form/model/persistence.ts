import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { buildQueryIR } from '@/features/form/model/compile';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { expertQueryController } from '@/features/form/model/controllers';
import { getAllNodes, isContainerNode } from '@/features/form/model/form-utils';
import type { NewFormState } from '@/features/form/model/state';
import { createDefaultFormState } from '@/features/form/model/state';
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

export type RestoredFormState = NewFormState & { issues: RestoreIssue[] };

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
	const root = builder.getRoot();
	if (!root) return null;
	for (const form of getAllNodes(root, 'form')) {
		const field = getAllNodes(form, 'field').find(field => field.controller.kind === expertQueryController.kind);
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

function throwCodecIssues(issues: RestoreIssue[]) {
	if (!issues.length) return;
	throw new Error(issues.map(issue => issue.message).join('\n'));
}

function setActivePath(root: FormNode, targetId: string, activeContainers: Record<string, string | null>): boolean {
	if (!isContainerNode(root)) return root.id === targetId;
	for (const child of root.children) {
		if (child.id === targetId || setActivePath(child, targetId, activeContainers)) {
			activeContainers[root.id] = child.id;
			return true;
		}
	}
	return false;
}

function valueDiffers(left: string | null | undefined, right: string | null | undefined): boolean {
	return (left ?? null) !== (right ?? null);
}

function hasPersistedValue(state: NewFormState, field: FormFieldNode, context: FormRuntimeContext): boolean {
	const current = state.state[field.id];
	const defaults = field.controller.createDefaultState(field, context);
	return JSON.stringify(current) !== JSON.stringify(defaults);
}

function inferActiveContainersFromValues(form: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext) {
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
		if (firstActiveChild && !active[node.id]) active[node.id] = firstActiveChild;
		return !!firstActiveChild;
	}

	visit(form);
}

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

function applyTabState(form: FormBoundaryNode, payload: EncodedFieldValue | undefined, state: NewFormState, issues: RestoreIssue[]): number {
	let applied = 0;
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
		applied += 1;
	}
	return applied;
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

function encodeScopedFormState(form: FormNode, context: FormRuntimeContext, state: NewFormState, issues?: RestoreIssue[]): ScopedFormQuery {
	const codecIssues: RestoreIssue[] = [];
	const codec = buildFieldCodec(form, context, codecIssues);
	if (issues) issues.push(...codecIssues);
	else throwCodecIssues(codecIssues);

	const query: ScopedFormQuery = {
		[`${FORM_QUERY_PREFIX}form`]: form.id,
	};

	for (const { field, key } of codec) {
		const encoded = field.controller.encode(state.state[field.id], field, context);
		if (encoded == null || (Array.isArray(encoded) && !encoded.length) || encoded === '') continue;
		query[`${FORM_QUERY_PREFIX}${key}`] = encoded;
	}

	const tabs = queryAffectingTabParams(form, state);
	if (tabs.length) query[`${FORM_QUERY_PREFIX}tab`] = tabs;

	return query;
}

export function compileFormState(node: FormNode, state: NewFormState, context: FormRuntimeContext, issues?: RestoreIssue[]): CompiledFormStateWithSummaries {
	if (node.kind !== 'form') console.warn(`Compiling state non-form node '${node.id}'.`);

	// Compile what's in the form
	const { query, summaries } = buildQueryIR(node, state, context);
	const compiled = compileQueryIR(query);
	// overwrite with raw overrides
	for (const parameter of NATIVE_BLACKLAB_PARAMETERS) {
		if (state.rawOverrides?.[parameter]) compiled[parameter] = state.rawOverrides[parameter];
	}

	return {
		...compiled,
		formId: node.id,
		encoded: encodeScopedFormState(node, context, state, issues),
		summaries,
	};
}

export function restoreScopedFormState(builder: FormBuilder, query: Record<string, unknown>, canonical: BlackLabParameters = {}): RestoredFormState {
	const issues: RestoreIssue[] = [];
	const scoped = readScopedQuery(query);
	const consumed = new Set<string>();
	const expert = findExpertForm(builder);
	const requestedFormId = first(scoped.values.form);
	let formNode = builder.formsById.value[requestedFormId as string] ?? builder.formsList.value[0];
	const isFormNodeTheRequestedForm = formNode?.id === requestedFormId;
	let hasUsableScopedState = false;

	if (scoped.keys.has('form')) {
		consumed.add('form');
		if (isFormNodeTheRequestedForm && requestedFormId) {
			hasUsableScopedState = true;
		} else {
			issues.push({
				key: 'form',
				message: requestedFormId ? `No current form accepts persisted selector '${requestedFormId}'.` : 'Persisted form selector has no value.',
			});
		}
	}

	const state = createDefaultFormState(builder.getRoot(), builder.context);
	setActivePath(builder.getRoot(), formNode.id, state.uiState);

	const codec = buildFieldCodec(formNode, builder.context, issues);
	const byKey = new Map(codec.map(entry => [entry.key, entry]));
	for (const [key, entry] of byKey) {
		if (!scoped.keys.has(key)) continue;
		consumed.add(key);
		const payload = scoped.values[key];
		if (payload == null) {
			issues.push({ key, nodeId: entry.field.id, message: `Persisted field '${key}' has no value.` });
			continue;
		}
		if (restoreField(entry, payload, builder.context, state, issues)) hasUsableScopedState = true;
	}

	if (scoped.keys.has('tab')) {
		consumed.add('tab');
		if (scoped.values.tab == null) issues.push({ key: 'tab', message: 'Persisted tab selection has no value.' });
		else if (applyTabState(formNode, scoped.values.tab, state, issues) > 0) hasUsableScopedState = true;
	}

	for (const key of scoped.keys) {
		if (!consumed.has(key)) issues.push({ key, message: `No current form field accepts persisted key '${key}'.` });
	}

	if (!hasUsableScopedState && isNonEmpty(canonical.patt) && expert) {
		formNode = expert.form;
		setActivePath(builder.getRoot(), formNode.id, state.uiState);
		state.state[expert.field.id] = canonical.patt;
	}

	inferActiveContainersFromValues(formNode, state, builder.context);

	const compiled = compileQueryIR(buildQueryIR(formNode, state, builder.context).query);
	for (const parameter of NATIVE_BLACKLAB_PARAMETERS) {
		if (valueDiffers(compiled[parameter], canonical[parameter])) state.rawOverrides[parameter] = canonical[parameter] ?? null;
		if (!isNonEmpty(state.rawOverrides[parameter])) delete state.rawOverrides[parameter];
	}

	return {
		...state,
		issues,
	};
}
