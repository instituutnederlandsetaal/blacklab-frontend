import { buildFormQuery } from '@/features/form/model/compile';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';
import { expertQueryController } from '@/features/form/model/controllers';
import { getAllNodes, isContainerNode } from '@/features/form/model/form-utils';
import { createFormState } from '@/features/form/model/state';
import type { BlackLabParameter, EncodedFieldValue, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { CompiledFormState, PersistableFormState } from '@/features/form/model/types/form-query';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';
import type { FormState, FormSystemDefinition } from '@/features/form/model/types/form-state';

export const FORM_QUERY_PREFIX = 'f.';

export type CanonicalBlackLabFormParameters = {
	patt?: string | null;
	filter?: string | null;
	searchField?: string | null;
};

export type ScopedFormQuery = Record<string, string | string[] | undefined>;

export type RestoreIssue = {
	key?: string;
	nodeId?: string;
	message: string;
};

export type RestoredScopedFormState = {
	formId: string;
	state: FormState;
	issues: RestoreIssue[];
};

export type EncodedPersistableFormState = {
	form: string;
	state?: string;
	cql?: string;
	filter?: string;
	searchField?: string;
	resultPreset?: string;
};

type FieldCodecEntry = {
	field: FormFieldNode;
	key: string;
};

function formPersistKey(form: FormBoundaryNode): string {
	const key = (form as FormBoundaryNode & { persistKey?: unknown }).persistKey;
	return typeof key === 'string' && key ? key : form.id;
}

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

function findForm(definition: FormSystemDefinition, requested: string | null): FormBoundaryNode {
	const forms = getAllNodes(definition.root, 'form');
	return forms.find(form => formPersistKey(form) === requested || form.id === requested) ?? forms[0];
}

function findExpertForm(definition: FormSystemDefinition): { form: FormBoundaryNode; field: FormFieldNode } | null {
	for (const form of getAllNodes(definition.root, 'form')) {
		const field = getAllNodes(form, 'field').find(field => field.controller.kind === expertQueryController.kind);
		if (field) return { form, field };
	}
	return null;
}

function buildFieldCodec(form: FormBoundaryNode, context: FormRuntimeContext, issues: RestoreIssue[] = []): FieldCodecEntry[] {
	const seen = new Map<string, FormFieldNode>();
	const entries: FieldCodecEntry[] = [];
	for (const field of getAllNodes(form, 'field')) {
		const key = field.controller.getPersistKey(field, context);
		const previous = seen.get(key);
		if (previous && previous !== field) {
			issues.push({
				key,
				nodeId: field.id,
				message: `Duplicate form persistence key '${key}' for '${previous.id}' and '${field.id}'.`,
			});
			continue;
		}
		seen.set(key, field);
		entries.push({ field, key });
	}
	return entries;
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

function compileWithoutRawOverrides(form: FormBoundaryNode, state: FormState, context: FormRuntimeContext): CompiledFormState {
	const saved = state.rawOverrides;
	state.rawOverrides = {};
	try {
		return compileQueryIR(buildFormQuery(form, state, context));
	} finally {
		state.rawOverrides = saved;
	}
}

function hasPersistedValue(state: FormState, field: FormFieldNode, context: FormRuntimeContext): boolean {
	const current = state.controllerState[field.id];
	const defaults = field.controller.createDefaultState(field, context);
	return JSON.stringify(current) !== JSON.stringify(defaults);
}

function inferActiveContainersFromValues(form: FormBoundaryNode, state: FormState, context: FormRuntimeContext) {
	const active = state.uiState.activeContainers;
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

function restoreField(entry: FieldCodecEntry, payload: EncodedFieldValue, context: FormRuntimeContext, state: FormState, issues: RestoreIssue[]) {
	if (!entry.field.controller.restore) {
		issues.push({
			key: entry.key,
			nodeId: entry.field.id,
			message: `Field '${entry.field.id}' cannot restore persisted value '${entry.key}'.`,
		});
		return;
	}
	try {
		const restored = entry.field.controller.restore(payload, entry.field, context);
		if (restored && typeof restored === 'object' && 'state' in restored) {
			state.controllerState[entry.field.id] = restored.state;
			for (const warning of restored.warnings ?? []) issues.push({ key: entry.key, nodeId: entry.field.id, message: warning });
			for (const error of restored.errors ?? []) issues.push({ key: entry.key, nodeId: entry.field.id, message: error });
		} else {
			state.controllerState[entry.field.id] = restored;
		}
	} catch (error) {
		issues.push({
			key: entry.key,
			nodeId: entry.field.id,
			message: error instanceof Error ? error.message : `Could not restore field '${entry.field.id}'.`,
		});
	}
}

function applyTabState(form: FormBoundaryNode, payload: EncodedFieldValue | undefined, state: FormState, issues: RestoreIssue[]) {
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
		state.uiState.activeContainers[container.id] = child.id;
	}
}

function queryAffectingTabParams(form: FormBoundaryNode, state: FormState): string[] {
	const tabs: string[] = [];
	for (const container of getAllNodes(form, 'container', 'form')) {
		const activeChildId = state.uiState.activeContainers[container.id];
		const activeChild = container.children.find(child => child.id === activeChildId);
		if (!activeChild || (activeChild.kind !== 'container' && activeChild.kind !== 'form') || !activeChild.activeQueryContribution) continue;
		tabs.push(`${container.id}:${activeChild.id}`);
	}
	return tabs;
}

export function restoreScopedFormState(
	definition: FormSystemDefinition,
	context: FormRuntimeContext,
	query: Record<string, unknown>,
	canonical: CanonicalBlackLabFormParameters = {},
): RestoredScopedFormState {
	const issues: RestoreIssue[] = [];
	const scoped = readScopedQuery(query);
	const consumed = new Set<string>();
	const expert = findExpertForm(definition);
	const requestedFormId = first(scoped.values.form);
	let formNode = findForm(definition, requestedFormId);
	const isFormNodeTheRequestedForm = formPersistKey(formNode) === requestedFormId || formNode.id === requestedFormId;

	if (scoped.keys.has('form')) {
		consumed.add('form');
		if (!isFormNodeTheRequestedForm) {
			issues.push({
				key: 'form',
				message: requestedFormId ? `No current form accepts persisted selector '${requestedFormId}'.` : 'Persisted form selector has no value.',
			});
		}
	}

	const state = createFormState(definition, context);
	setActivePath(definition.root, formNode.id, state.uiState.activeContainers);

	const codec = buildFieldCodec(formNode, context, issues);
	const byKey = new Map(codec.map(entry => [entry.key, entry]));
	for (const [key, entry] of byKey) {
		if (!scoped.keys.has(key)) continue;
		consumed.add(key);
		const payload = scoped.values[key];
		if (payload == null) {
			issues.push({ key, nodeId: entry.field.id, message: `Persisted field '${key}' has no value.` });
			continue;
		}
		restoreField(entry, payload, context, state, issues);
	}

	if (scoped.keys.has('tab')) {
		consumed.add('tab');
		if (scoped.values.tab == null) issues.push({ key: 'tab', message: 'Persisted tab selection has no value.' });
		else applyTabState(formNode, scoped.values.tab, state, issues);
	}

	for (const key of scoped.keys) {
		if (!consumed.has(key)) issues.push({ key, message: `No current form field accepts persisted key '${key}'.` });
	}

	const hasRecognizedScopedState = consumed.size > 0;
	if (!hasRecognizedScopedState && isNonEmpty(canonical.patt) && expert) {
		formNode = expert.form;
		setActivePath(definition.root, formNode.id, state.uiState.activeContainers);
		state.controllerState[expert.field.id] = { query: canonical.patt, targetQueries: [] };
	}

	inferActiveContainersFromValues(formNode, state, context);

	const compiled = compileWithoutRawOverrides(formNode, state, context);
	if (valueDiffers(compiled.cql, canonical.patt)) state.rawOverrides.patt = canonical.patt ?? null;
	if (valueDiffers(compiled.filter, canonical.filter)) state.rawOverrides.filter = canonical.filter ?? null;
	if (valueDiffers(compiled.searchField, canonical.searchField)) state.rawOverrides.searchField = canonical.searchField ?? null;

	for (const key of Object.keys(state.rawOverrides) as BlackLabParameter[]) {
		if (!isNonEmpty(state.rawOverrides[key])) delete state.rawOverrides[key];
	}

	return {
		formId: formNode.id,
		state,
		issues,
	};
}

export function encodeScopedFormQuery(definition: FormSystemDefinition, context: FormRuntimeContext, snapshot: PersistableFormState): ScopedFormQuery {
	const form = findForm(definition, snapshot.formId);
	const issues: RestoreIssue[] = [];
	const codec = buildFieldCodec(form, context, issues);
	const query: ScopedFormQuery = {
		[`${FORM_QUERY_PREFIX}form`]: formPersistKey(form),
	};

	for (const { field, key } of codec) {
		const encoded = field.controller.encode?.(snapshot.state.controllerState[field.id], field, context);
		if (encoded == null || (Array.isArray(encoded) && !encoded.length) || encoded === '') continue;
		query[`${FORM_QUERY_PREFIX}${key}`] = encoded;
	}

	const tabs = queryAffectingTabParams(form, snapshot.state);
	if (tabs.length) query[`${FORM_QUERY_PREFIX}tab`] = tabs;

	return query;
}

/**
 * Backwards-compatible JSON codec kept for story/debug callers that have only a snapshot.
 * URL integration should use encodeScopedFormQuery/restoreScopedFormState.
 */
export function encodeSubmittedForm(snapshot: PersistableFormState): EncodedPersistableFormState {
	return {
		form: snapshot.formId,
		state: JSON.stringify(snapshot.state),
		cql: snapshot.cql ?? undefined,
		filter: snapshot.filter ?? undefined,
		searchField: snapshot.searchField ?? undefined,
	};
}

export function decodeSubmittedSnapshot(encoded: EncodedPersistableFormState): PersistableFormState | null {
	try {
		const state = JSON.parse(encoded.state ?? '') as FormState;
		return {
			formId: encoded.form,
			state,
			cql: encoded.cql ?? null,
			filter: encoded.filter ?? null,
			searchField: encoded.searchField ?? null,
		};
	} catch {
		return null;
	}
}
