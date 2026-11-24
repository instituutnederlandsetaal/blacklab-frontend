import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from 'vue';

import { combineCqlPatterns } from '@/features/form/model/compile/query-artifact';
import { isContainerNode } from '@/features/form/model/form-utils';
import { FORM_QUERY_PREFIX, resolvePersistenceSchema, SCOPED_FORM_KEYS } from '@/features/form/model/persistence/schema';
import type { NewFormState } from '@/features/form/model/state';
import { encodeFieldState, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { isFormOutputName, isValidEmission, type Emit, type FormEmission, type FormIssue, type FormOutputName, type ResultPreset, type SummaryEntry } from '@/features/form/model/types/form-output';
import { booleanNode, type CqlPatternNode, type LuceneNode } from '@/features/form/model/types/form-query-ir';
import type { ScopedFormQuery } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode, FormContainerLikeNode, FormFieldNode, FormNode, QueryCombineMode } from '@/features/form/model/types/form-shape';

type Sink = (emission: FormEmission) => void;
export type FormFieldVisitor = (field: FormFieldNode, state: unknown, context: GatherContext, sink: Sink) => void;

type GatheredValues = { emissions: FormEmission[]; issues: FormIssue[]; summaries: SummaryEntry[] };

type GatherContext = {
	values: GatheredValues;
	runtime: FormRuntimeContext;
	formState?: NewFormState;
	visitedFields: Set<FormFieldNode>;
	fieldVisitor?: FormFieldVisitor;
	submission?: {
		encoded: ScopedFormQuery;
		keys: ReadonlyMap<FormFieldNode, string>;
		tabs: Set<string>;
		resultPreset?: ResultPreset;
	};
};

function reportIssue(context: GatherContext, severity: FormIssue['severity'], message: string): void {
	context.values.issues.push({ severity, message });
}

function invoke(context: GatherContext, nodeId: string, callback: () => void): void {
	try {
		callback();
	} catch (error) {
		reportIssue(context, 'error', `Controller for '${nodeId}' failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function emitValue(context: GatherContext, nodeId: string, sink: Sink, declared: readonly FormOutputName[] | undefined, name: unknown, value: unknown): void {
	if (value === undefined) return;
	const emission = { name, value };
	if (!isValidEmission(emission)) {
		const knownName = typeof name === 'string' && isFormOutputName(name);
		reportIssue(context, 'warning', `Controller for '${nodeId}' emitted ${knownName ? 'malformed' : 'unknown'} output '${String(name)}'; ignoring it.`);
		return;
	}
	if (declared && !declared.includes(emission.name)) reportIssue(context, 'warning', `Controller for '${nodeId}' emitted undeclared output '${emission.name}'.`);
	sink(emission);
}

function persistField(context: GatherContext, field: FormFieldNode, state: unknown): void {
	const persistence = context.submission;
	const key = persistence?.keys.get(field);
	if (!persistence || !key) return;
	try {
		const value = encodeFieldState(field, state, context.runtime);
		if (value != null && value !== '') persistence.encoded[`${FORM_QUERY_PREFIX}${key}`] = value;
	} catch (error) {
		reportIssue(context, 'error', `Could not persist '${key}' for controller '${field.id}': ${error instanceof Error ? error.message : String(error)}`);
	}
}

function collectField(node: FormFieldNode, state: unknown, context: GatherContext, sink: Sink): void {
	const emit = ((name: unknown, value: unknown) => {
		emitValue(context, node.id, sink, node.controller.outputs, name, value);
	}) as Emit;
	invoke(context, node.id, () => node.controller.collect(node, context.runtime, state, emit));
}

function visitField(node: FormFieldNode, state: unknown, context: GatherContext, sink: Sink): void {
	collectField(node, state, context, sink);
	if (!context.visitedFields.has(node)) {
		invoke(context, node.id, () =>
			node.controller.summarize?.(node, context.runtime, state, summary => {
				context.values.summaries.push({ ...summary, summaryType: [...(summary.summaryType ?? node.controller.outputs)] });
			}),
		);
		persistField(context, node, state);
	}
	const submission = context.submission;
	if (submission && node.controller.getResultPreset) {
		invoke(context, node.id, () => {
			const preset = node.controller.getResultPreset!(node, context.runtime, state);
			if (submission.resultPreset === undefined) submission.resultPreset = preset;
		});
	}
	context.visitedFields.add(node);
}

// Containers combine filter and pattern emissions into AND or OR clauses.

const SCOPED_OUTPUTS = ['patt', 'collpatt', 'filter'] as const;
type ScopedOutputName = (typeof SCOPED_OUTPUTS)[number];
type ScopedEmission = Extract<FormEmission, { name: ScopedOutputName }>;

function emitCombinedValues(combine: QueryCombineMode, emissions: ScopedEmission[], sink: Sink): void {
	const emitted = new Set<ScopedOutputName>();
	for (const source of emissions) {
		if (emitted.has(source.name)) continue;
		emitted.add(source.name);
		const matching = emissions.filter(emission => emission.name === source.name);
		const value =
			source.name === 'filter'
				? (booleanNode(
						combine === 'or' ? 'or' : 'and',
						matching.map(emission => emission.value as LuceneNode),
					) as LuceneNode | null)
				: combineCqlPatterns(
						matching.map(emission => emission.value as CqlPatternNode),
						combine,
					);
		if (value) sink({ name: source.name, value } as ScopedEmission);
	}
}

function visitContainer(node: FormContainerLikeNode, context: GatherContext, sink: Sink): void {
	const emissions: ScopedEmission[] = [];
	const scopedSink: Sink = emission => {
		if ((SCOPED_OUTPUTS as readonly FormOutputName[]).includes(emission.name)) emissions.push(emission as ScopedEmission);
		else sink(emission);
	};
	const selectedChild = node.activeChildOutputProducers && node.children.find(child => child.id === context.formState?.uiState[node.id]);
	const activeProducer = selectedChild ? node.activeChildOutputProducers?.[selectedChild.id] : undefined;
	if (activeProducer) context.submission?.tabs.add(`${node.id}:${selectedChild!.id}`);

	for (const child of node.children) visitNode(child, context, scopedSink);
	if (activeProducer) invoke(context, node.id, () => activeProducer(((name: unknown, value: unknown) => emitValue(context, node.id, scopedSink, undefined, name, value)) as Emit));
	emitCombinedValues(node.kind === 'container' ? (node.combine ?? 'and') : 'and', emissions, sink);
}

function visitNode(node: FormNode, context: GatherContext, sink: Sink): void {
	if (node.kind === 'field') (context.fieldVisitor ?? visitField)(node, context.formState?.state[node.id], context, sink);
	else if (isContainerNode(node)) visitContainer(node, context, sink);
}

function gather(runtime: FormRuntimeContext, formState?: NewFormState): GatherContext {
	return { runtime, formState, values: { issues: [], emissions: [], summaries: [] }, visitedFields: new Set() };
}

export function collectFormValues(node: FormBoundaryNode, formState: NewFormState, runtime: FormRuntimeContext, schema = resolvePersistenceSchema(node, runtime)) {
	const encoded: ScopedFormQuery = { [`${FORM_QUERY_PREFIX}${SCOPED_FORM_KEYS.formSelector}`]: node.id };
	const tabs = new Set<string>();
	const context = gather(runtime, formState);
	context.values.issues.push(...schema.issues);
	context.submission = { encoded, keys: schema.keys, tabs };
	visitNode(node, context, emission => context.values.emissions.push(emission));
	if (tabs.size) encoded[`${FORM_QUERY_PREFIX}${SCOPED_FORM_KEYS.tabSelections}`] = [...tabs];
	const { resultPreset } = context.submission;
	return { ...context.values, encoded, ...(resultPreset !== undefined ? { resultPreset } : {}) };
}

export function collectFormSummaryValues(node: FormBoundaryNode, formState: NewFormState, runtime: FormRuntimeContext, fieldVisitor?: FormFieldVisitor): GatheredValues {
	const context = gather(runtime, formState);
	context.fieldVisitor = fieldVisitor;
	visitNode(node, context, emission => context.values.emissions.push(emission));
	return context.values;
}

/** Share reactive field work across live summaries while preserving each graph edge's emissions. */
export function createSummaryFieldVisitor(state: MaybeRefOrGetter<NewFormState['state']>, runtime: FormRuntimeContext): FormFieldVisitor {
	const fields = new Map<FormFieldNode, ComputedRef<GatheredValues>>();
	return (field, _state, context, sink) => {
		let cached = fields.get(field);
		if (!cached) {
			cached = computed(() => {
				const context = gather(runtime);
				visitField(field, toValue(state)[field.id], context, emission => context.values.emissions.push(emission));
				return context.values;
			});
			fields.set(field, cached);
		}
		const values = cached.value;
		values.emissions.forEach(sink);
		context.values.issues.push(...values.issues);
		if (!context.visitedFields.has(field)) {
			for (const summary of values.summaries) context.values.summaries.push({ ...summary, summaryType: [...summary.summaryType] });
		}
		context.visitedFields.add(field);
	};
}

/** Check a field's validated semantic contributions without evaluating auxiliary channels. */
export function hasEmissions(field: FormFieldNode, state: unknown, runtime: FormRuntimeContext): boolean {
	let hasEmission = false;
	collectField(field, state, gather(runtime), () => (hasEmission = true));
	return hasEmission;
}
