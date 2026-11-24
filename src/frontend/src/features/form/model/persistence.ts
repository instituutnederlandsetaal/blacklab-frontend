import type { FormOverrides } from '@/features/form';
import type { ParallelFieldConfig } from '@/features/form/fields/parallel-field';
import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { compileFormWithOverrides } from '@/features/form/model/compile/form';
import { expertQueryController, parallelController, restoreCanonicalPatternInParallelField } from '@/features/form/model/controllers';
import { findPathToNode, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import { FORM_QUERY_PREFIX, resolvePersistenceSchema, SCOPED_FORM_KEYS } from '@/features/form/model/persistence/schema';
import { createDefaultFormState, type NewFormState } from '@/features/form/model/state';
import { restoreFieldState } from '@/features/form/model/types/form-controllers';
import type { FormIssue } from '@/features/form/model/types/form-output';
import type { CompiledFormResult } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

type RestoredFormState = NewFormState & {
	issues: FormIssue[];
};

export type RestoredForm = {
	state: RestoredFormState;
	submittedResult: CompiledFormResult | null;
};

function findExpertFallback(definition: FormBuilder, canonicalPattern: string, canonicalSearchfield: string | undefined): { form: FormBoundaryNode; fieldId: string; state: unknown } | null {
	for (const form of definition.formsList) {
		for (const f of walkFormNodes(form, 'field')) {
			if (f.controller.kind === expertQueryController.kind) return { form, fieldId: f.id, state: canonicalPattern };
			if (f.controller.kind !== parallelController.kind) continue;

			const parallelField = f as FormFieldNode & ParallelFieldConfig;
			if (parallelField.childFieldTemplate.controller.kind !== expertQueryController.kind) continue;
			const state = restoreCanonicalPatternInParallelField(parallelField, definition.context, canonicalPattern, canonicalSearchfield);
			if (!state) continue;
			return { form, fieldId: f.id, state };
		}
	}
	return null;
}

/** Each container opens its first child with a persisted field, including on shared paths. */
function selectPersistedFieldPaths(node: FormNode, persisted: Set<FormFieldNode>, uiState: NewFormState['uiState']): boolean {
	if (node.kind === 'field') return persisted.has(node);
	if (!isContainerNode(node)) return false;
	let selected = false;
	for (const child of node.children) {
		if (selectPersistedFieldPaths(child, persisted, uiState) && !selected) {
			uiState[node.id] = child.id;
			selected = true;
		}
	}
	return selected;
}

function restoreTabSelections(definition: FormBuilder, tabs: string[] | undefined, uiState: NewFormState['uiState'], issues: FormIssue[]): boolean {
	let restored = false;
	if (tabs?.length === 0) issues.push({ severity: 'warning', message: 'Persisted tab selection has no value.' });
	for (const tab of tabs ?? []) {
		const [containerKey, childKey, extra] = tab.split(':');
		if (!containerKey || !childKey || extra !== undefined) {
			issues.push({ severity: 'warning', message: `Invalid persisted tab selection '${tab}'.` });
			continue;
		}
		const container = definition.getNode(containerKey);
		if (!isContainerNode(container)) {
			issues.push({ severity: 'warning', message: `No current form container accepts persisted tab key '${containerKey}'.` });
			continue;
		}
		if (!container.children.some(child => child.id === childKey)) {
			issues.push({ severity: 'warning', message: `No child '${childKey}' exists in persisted tab container '${containerKey}'.` });
			continue;
		}
		uiState[container.id] = childKey;
		restored = true;
	}
	return restored;
}

export function restoreForm(definition: FormBuilder, query: Record<string, unknown>, overrideOptions: FormOverrides = {}): RestoredForm {
	const fields = new Map<string, string[]>();
	for (const [key, value] of Object.entries(query)) {
		if (!key.startsWith(FORM_QUERY_PREFIX) || key.length === FORM_QUERY_PREFIX.length) continue;
		const values = Array.isArray(value) ? value : [value];
		fields.set(
			key.slice(FORM_QUERY_PREFIX.length),
			values.filter((v): v is string => typeof v === 'string'),
		);
	}
	const selector = fields.get(SCOPED_FORM_KEYS.formSelector);
	const tabs = fields.get(SCOPED_FORM_KEYS.tabSelections);
	fields.delete(SCOPED_FORM_KEYS.formSelector);
	fields.delete(SCOPED_FORM_KEYS.tabSelections);

	const requestedId = selector?.[0];
	const form = definition.getForm(requestedId ?? '') ?? definition.formsList[0];
	if (!form) throw new Error('Cannot restore form state because the form builder has no form nodes.');
	const issues: FormIssue[] = [];
	if (selector && requestedId !== form.id) {
		issues.push({ severity: 'warning', message: requestedId ? `No current form accepts persisted selector '${requestedId}'.` : 'Persisted form selector has no value.' });
	}

	const state = createDefaultFormState(definition.context, ...definition.nodeList);
	const schema = resolvePersistenceSchema(form, definition.context);
	const persistedFields = new Set<FormFieldNode>();
	let restoredField = false;
	for (const [field, key] of schema.keys) {
		const values = fields.get(key);
		if (!values) continue;
		fields.delete(key);
		persistedFields.add(field);
		if (!values.length) {
			issues.push({ severity: 'warning', message: `Persisted field '${key}' for '${field.id}' has no value.` });
			continue;
		}
		try {
			state.state[field.id] = restoreFieldState(field, values.length === 1 ? values[0] : values, definition.context);
			restoredField = true;
		} catch (error) {
			issues.push({ severity: 'error', message: `Could not restore persisted field '${key}' for '${field.id}': ${error instanceof Error ? error.message : String(error)}` });
		}
	}
	selectPersistedFieldPaths(form, persistedFields, state.uiState);
	const restoredTab = restoreTabSelections(definition, tabs, state.uiState, issues);
	for (const key of fields.keys()) issues.push({ severity: 'warning', message: `No current form field accepts persisted key '${key}'.` });

	const fallback = !restoredField && !restoredTab && overrideOptions.patt ? findExpertFallback(definition, overrideOptions.patt, overrideOptions.searchfield) : null;
	if (fallback) state.state[fallback.fieldId] = fallback.state;
	const activeForm = fallback?.form ?? form;
	const path = findPathToNode(definition.getRoot(), activeForm.id) ?? [];
	for (let i = 1; i < path.length; i++) state.uiState[path[i - 1]] = path[i];

	const { result, overrides } = compileFormWithOverrides(activeForm, state, definition.context, overrideOptions, 'restore', activeForm === form ? schema : undefined);
	state.rawOverrides = overrides;
	return {
		state: { ...state, issues: [...schema.issues, ...issues] },
		submittedResult: !fallback && requestedId === form.id ? { ...result, issues: [...issues, ...result.issues] } : null,
	};
}
