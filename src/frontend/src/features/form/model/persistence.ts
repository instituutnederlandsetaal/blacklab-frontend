import type { ParallelFieldConfig } from '@/features/form/fields/parallel-field';
import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { applyRawOverrides, compileFormNode } from '@/features/form/model/compile/form';
import { expertQueryController, parallelController, restoreCanonicalPatternInParallelField } from '@/features/form/model/controllers';
import { findPathToNode, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import { FORM_QUERY_PREFIX, resolvePersistenceSchema, SCOPED_FORM_KEYS } from '@/features/form/model/persistence/schema';
import { createDefaultFormState, type FormOverrides, type NewFormState } from '@/features/form/model/state';
import { restoreFieldState, type EncodedFieldValue, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormIssue } from '@/features/form/model/types/form-output';
import type { CompiledFormResult } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

export type RestoredFormState = NewFormState & {
	issues: FormIssue[];
};

export type RestoredForm = {
	state: RestoredFormState;
	submittedResult: CompiledFormResult | null;
};

export type RestoreFormStateOptions = {
	overrideCandidates?: Readonly<FormOverrides>;
	legacyPattern?: {
		pattern: string;
		searchfield?: string | null;
	};
};

type DecodedScopedParameter = { present: false } | { present: true; value: EncodedFieldValue | undefined };

function asArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
	return typeof value === 'string' ? [value] : [];
}

function findExpertFallback(definition: FormBuilder, canonicalPattern: string, canonicalSearchfield: string | null | undefined): { form: FormBoundaryNode; fieldId: string; state: unknown } | null {
	for (const form of definition.formsList) {
		for (const f of walkFormNodes(form, 'field')) {
			if (f.controller.kind === expertQueryController.kind) return { form, fieldId: f.id, state: canonicalPattern };
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

function getUiStateForPath(root: FormNode, targetId: string): Record<string, string> {
	const activeContainers: Record<string, string> = {};
	const path = findPathToNode(root, targetId);
	if (path) {
		for (let i = 0; i < path.length - 1; i++) {
			const containerId = path[i];
			const childId = path[i + 1];
			activeContainers[containerId] = childId;
		}
	}
	return activeContainers;
}

function inferUiStateFromPersistedFields(
	scopedForm: FormBoundaryNode,
	persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>,
	keys: ReadonlyMap<FormFieldNode, string>,
): Record<string, string> {
	type PathEntry = { containerId: string; childId: string };
	const activeContainers: Record<string, string> = {};

	function visit(node: FormNode, path: PathEntry[]): void {
		if (node.kind === 'field') {
			if (!persistedFields.has(keys.get(node) ?? '')) return;
			for (const { containerId, childId } of path) activeContainers[containerId] ??= childId;
			return;
		}
		if (!isContainerNode(node)) return;
		for (const child of node.children) visit(child, [...path, { containerId: node.id, childId: child.id }]);
	}

	visit(scopedForm, []);
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

function restorePersistedFields(keys: ReadonlyMap<FormFieldNode, string>, persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>, context: FormRuntimeContext) {
	const state: Record<string, unknown> = {};
	const issues: FormIssue[] = [];
	const knownKeys = new Set(keys.values());

	for (const [field, key] of keys) {
		if (!persistedFields.has(key)) continue;
		const payload = persistedFields.get(key);
		if (payload == null) {
			issues.push({ severity: 'warning', message: `Persisted field '${key}' for '${field.id}' has no value.` });
			continue;
		}

		try {
			state[field.id] = restoreFieldState(field, payload, context);
		} catch (error) {
			issues.push({
				severity: 'error',
				message: `Could not restore persisted field '${key}' for '${field.id}': ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}

	const unrecognizedIssues: FormIssue[] = [...persistedFields.keys()]
		.filter(key => !knownKeys.has(key))
		.map(key => ({ severity: 'warning', message: `No current form field accepts persisted key '${key}'.` }));
	return { state, issues, unrecognizedIssues };
}

function decodePersistedTabSelections(definition: FormBuilder, persistedTabs: DecodedScopedParameter) {
	const uiState: Record<string, string> = {};
	const issues: FormIssue[] = [];
	if (!persistedTabs.present) return { uiState, issues };
	if (persistedTabs.value == null) {
		return { uiState, issues: [{ severity: 'warning' as const, message: 'Persisted tab selection has no value.' }] };
	}

	for (const tab of asArray(persistedTabs.value)) {
		const [containerKey, childKey] = tab.split(':');
		if (!containerKey || !childKey || tab.split(':').length !== 2) {
			issues.push({ severity: 'warning', message: `Invalid persisted tab selection '${tab}'.` });
			continue;
		}
		const container = definition.getNode(containerKey);
		if (!isContainerNode(container)) {
			issues.push({ severity: 'warning', message: `No current form container accepts persisted tab key '${containerKey}'.` });
			continue;
		}
		const child = container.children.find(child => child.id === childKey);
		if (!child) {
			issues.push({ severity: 'warning', message: `No child '${childKey}' exists in persisted tab container '${containerKey}'.` });
			continue;
		}
		uiState[container.id] = child.id;
	}
	return { uiState, issues };
}

export function restoreForm(definition: FormBuilder, query: Record<string, unknown>, options: RestoreFormStateOptions = {}): RestoredForm {
	if (!definition.formsList.length) throw new Error('Cannot restore form state because the form builder has no form nodes.');

	const scopedParams = decodeScopedFormParams(query);
	const overrideCandidates = options.overrideCandidates ?? {};
	const requestedFormId = scopedParams.formSelector.present ? (asArray(scopedParams.formSelector.value)[0] ?? null) : null;
	const scopedForm = definition.formsMap[requestedFormId ?? ''] ?? definition.formsList[0];

	let submittedFormId: string | null = null;
	const formSelectorIssues: FormIssue[] = [];
	if (scopedParams.formSelector.present) {
		if (requestedFormId === scopedForm.id) submittedFormId = requestedFormId;
		else {
			formSelectorIssues.push({
				severity: 'warning',
				message: requestedFormId ? `No current form accepts persisted selector '${requestedFormId}'.` : 'Persisted form selector has no value.',
			});
		}
	}

	const defaults = createDefaultFormState(definition.context, ...definition.nodeList);
	const schema = resolvePersistenceSchema(scopedForm, definition.context);
	const restoredFields = restorePersistedFields(schema.keys, scopedParams.fields, definition.context);
	const persistedTabs = decodePersistedTabSelections(definition, scopedParams.tabSelections);
	const issues: FormIssue[] = [...formSelectorIssues, ...schema.issues, ...restoredFields.issues, ...persistedTabs.issues, ...restoredFields.unrecognizedIssues];

	const finishRestore = (activeForm: FormBoundaryNode, finalSubmittedFormId: string | null, expertFallback: ReturnType<typeof findExpertFallback> = null): RestoredForm => {
		const restoredState: NewFormState = {
			state: {
				...defaults.state,
				...restoredFields.state,
				...(expertFallback ? { [expertFallback.fieldId]: expertFallback.state } : {}),
			},
			uiState: {
				...defaults.uiState,
				...inferUiStateFromPersistedFields(scopedForm, scopedParams.fields, schema.keys),
				...persistedTabs.uiState,
				...getUiStateForPath(definition.getRoot(), activeForm.id),
			},
			rawOverrides: {},
		};
		const activeSchema = activeForm === scopedForm ? schema : resolvePersistenceSchema(activeForm, definition.context);
		const compiled = compileFormNode(activeForm, restoredState, definition.context, activeSchema);
		const compiledParams = compiled.params as Readonly<Record<string, unknown>>;
		const rawOverrides = Object.fromEntries(Object.entries(overrideCandidates).filter(([parameter, value]) => !Object.hasOwn(compiledParams, parameter) || compiledParams[parameter] !== value));
		const state: RestoredFormState = {
			...restoredState,
			rawOverrides,
			issues,
		};

		return {
			state,
			submittedResult: finalSubmittedFormId ? applyRawOverrides({ ...compiled, issues: [...issues, ...compiled.issues] }, rawOverrides, activeForm.target.acceptedOutputs) : null,
		};
	};

	// Restored fields or tabs make the scoped form authoritative.
	if (Object.keys(restoredFields.state).length > 0 || Object.keys(persistedTabs.uiState).length > 0) return finishRestore(scopedForm, submittedFormId);

	// Without a canonical pattern, there is nothing to restore into an expert field.
	if (!options.legacyPattern?.pattern) return finishRestore(scopedForm, submittedFormId);

	// Canonical-only URLs use an expert form when the definition has a compatible field.
	const expertFallback = findExpertFallback(definition, options.legacyPattern.pattern, options.legacyPattern.searchfield);
	if (!expertFallback) return finishRestore(scopedForm, submittedFormId);

	return finishRestore(expertFallback.form, null, expertFallback);
}
