import type { ParallelFieldConfig } from '@/features/form/fields/parallel-field';
import type { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { acceptTargetEmissions, collectFormSummaryValues, collectFormValues, diagnoseTargetOutputs } from '@/features/form/model/compile';
import { expertQueryController, parallelController, restoreCanonicalPatternInParallelField } from '@/features/form/model/controllers';
import { findPathToNode, isContainerNode, walkFormNodes } from '@/features/form/model/form-utils';
import { FORM_QUERY_PREFIX, resolvePersistenceSchema, SCOPED_FORM_KEYS, type PersistenceSchemaEntry } from '@/features/form/model/persistence/schema';
import { createDefaultFormState, type FormOverrides, type NewFormState } from '@/features/form/model/state';
import { restoreFieldState, type EncodedFieldValue, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormIssue, FormOutputName } from '@/features/form/model/types/form-output';
import type { CompiledFormResult, CompiledFormSummary } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode, FormFieldNode, FormNode } from '@/features/form/model/types/form-shape';

type RestoreDiagnostic = {
	key?: string;
	nodeId?: string;
	message: string;
	code?: FormIssue['code'];
};

export type RestoredFormState = NewFormState & {
	issues: FormIssue[];
	/** Scoped form that can be compiled as the submitted query; canonical-only fallback stays null. */
	submittedFormId: string | null;
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

function inferUiStateFromPersistedFields(definition: FormBuilder, persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>, entries: PersistenceSchemaEntry[]): Record<string, string> {
	type PathEntry = { containerId: string; childId: string };
	const activeContainers: Record<string, string> = {};
	const keys = new Map(entries.map(entry => [entry.field, entry.key]));

	function visit(node: FormNode, path: PathEntry[]): void {
		if (node.kind === 'field') {
			if (!persistedFields.has(keys.get(node) ?? '')) return;
			for (const { containerId, childId } of path) activeContainers[containerId] ??= childId;
			return;
		}
		if (!isContainerNode(node)) return;
		for (const child of node.children) visit(child, [...path, { containerId: node.id, childId: child.id }]);
	}

	// Prefer the canonical root, then fall back to builder-owned detached graphs.
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

function restorePersistedFields(entries: PersistenceSchemaEntry[], persistedFields: ReadonlyMap<string, EncodedFieldValue | undefined>, context: FormRuntimeContext) {
	const state: Record<string, unknown> = {};
	const issues: RestoreDiagnostic[] = [];
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
	const issues: RestoreDiagnostic[] = [];
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

export function compileFormNode(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext): CompiledFormResult {
	return compileFormNodeWithSchema(node, state, context, resolvePersistenceSchema(node, context));
}

function compileCollected(node: FormBoundaryNode, state: NewFormState, collected: ReturnType<typeof collectFormSummaryValues>) {
	if (node.kind !== 'form') throw new Error(`Cannot compile non-form node '${node.id}'.`);
	const target = node.target;
	const issues: FormIssue[] = [...((state as NewFormState & { issues?: readonly FormIssue[] }).issues ?? []), ...collected.issues];
	diagnoseTargetOutputs(node, target.acceptedOutputs, issues);
	const accepted = acceptTargetEmissions(collected.emissions, target.acceptedOutputs, issues);
	return { params: target.compile(accepted as never, issues), issues };
}

function compileFormNodeWithSchema(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext, schema: ReturnType<typeof resolvePersistenceSchema>): CompiledFormResult {
	const collected = collectFormValues(node, state, context, schema);
	const { params, issues } = compileCollected(node, state, collected);

	return {
		formId: node.id,
		params,
		encoded: collected.encoded,
		issues,
		summaries: collected.summaries.map(summary => ({ ...summary, summaryType: summary.summaryType ? [...summary.summaryType] : undefined })),
		...(node.target.targetView ? { targetView: node.target.targetView } : {}),
		...(collected.resultPreset !== undefined ? { resultPreset: collected.resultPreset } : {}),
	};
}

/** Compile the live-summary projection without resolving persistence or result-preset channels. */
export function compileFormSummary(node: FormBoundaryNode, state: NewFormState, context: FormRuntimeContext): CompiledFormSummary {
	const collected = collectFormSummaryValues(node, state, context);
	return { params: compileCollected(node, state, collected).params, summaries: collected.summaries };
}

export function applyRawOverrides<Result extends Pick<CompiledFormResult, 'params'>>(result: Result, rawOverrides: Readonly<FormOverrides>, acceptedOutputs: readonly FormOutputName[]): Result {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	return {
		...result,
		params: {
			...result.params,
			...Object.fromEntries(Object.entries(rawOverrides).filter(([parameter]) => accepted.has(parameter as FormOutputName))),
		},
	} as Result;
}

export function restoreForm(definition: FormBuilder, query: Record<string, unknown>, options: RestoreFormStateOptions = {}): RestoredForm {
	if (!definition.formsList.length) throw new Error('Cannot restore form state because the form builder has no form nodes.');

	const scopedParams = decodeScopedFormParams(query);
	const overrideCandidates = options.overrideCandidates ?? {};
	const requestedFormId = scopedParams.formSelector.present ? (asArray(scopedParams.formSelector.value)[0] ?? null) : null;
	const scopedForm = definition.formsMap[requestedFormId ?? ''] ?? definition.formsList[0];

	let submittedFormId: string | null = null;
	const formSelectorIssues: RestoreDiagnostic[] = [];
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
	const schema = resolvePersistenceSchema(scopedForm, definition.context);
	const restoredFields = restorePersistedFields(schema.entries, scopedParams.fields, definition.context);
	const persistedTabs = decodePersistedTabSelections(definition, scopedParams.tabSelections);
	const schemaIssues = schema.issues.map(({ kind: _, ...issue }) => issue);
	const issues: FormIssue[] = [...formSelectorIssues, ...schemaIssues, ...restoredFields.issues, ...persistedTabs.issues, ...restoredFields.unrecognizedIssues].map(issue => ({
		...issue,
		stage: 'restore',
		code: 'invalid-restored-state',
	}));

	const finishRestore = (activeForm: FormBoundaryNode, finalSubmittedFormId: string | null, expertFallback: ReturnType<typeof findExpertFallback> = null): RestoredForm => {
		const restoredState: NewFormState = {
			state: {
				...defaults.state,
				...restoredFields.state,
				...(expertFallback ? { [expertFallback.fieldId]: expertFallback.state } : {}),
			},
			uiState: {
				...Object.fromEntries(definition.containerList.map(container => [container.id, container.children[0]?.id ?? null])),
				...inferUiStateFromPersistedFields(definition, scopedParams.fields, schema.entries),
				...persistedTabs.uiState,
				...getUiStateForPath([definition.getRoot()], activeForm.id),
			},
			rawOverrides: {},
		};
		const activeSchema = activeForm === scopedForm ? schema : resolvePersistenceSchema(activeForm, definition.context);
		const compiled = compileFormNodeWithSchema(activeForm, restoredState, definition.context, activeSchema);
		const compiledParams = compiled.params as Readonly<Record<string, unknown>>;
		const rawOverrides = Object.fromEntries(Object.entries(overrideCandidates).filter(([parameter, value]) => !Object.hasOwn(compiledParams, parameter) || compiledParams[parameter] !== value));
		const state: RestoredFormState = {
			...restoredState,
			rawOverrides,
			issues,
			submittedFormId: finalSubmittedFormId,
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

/** Restore hydratable state when the provisional submitted result is not needed. */
export function restoreFormState(definition: FormBuilder, query: Record<string, unknown>, options: RestoreFormStateOptions = {}): RestoredFormState {
	return restoreForm(definition, query, options).state;
}
