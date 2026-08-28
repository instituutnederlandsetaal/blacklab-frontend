import { combineCqlPatterns } from '@/features/form/model/compile/query-artifact';
import { isContainerNode } from '@/features/form/model/form-utils';
import type { NewFormState } from '@/features/form/model/state';
import { encodeFieldState, getFieldPersistKey, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { isFormOutputName, isValidEmission, type Emit, type FormEmission, type FormIssue, type FormOutputName, type ResultPreset, type SummaryEntry } from '@/features/form/model/types/form-output';
import { booleanNode, type CqlPatternNode, type LuceneNode } from '@/features/form/model/types/form-query-ir';
import type { ScopedFormQuery } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode, FormFieldNode, FormNode, QueryCombineMode } from '@/features/form/model/types/form-shape';

export type GatheredFormValues = {
	emissions: FormEmission[];
	summaries: SummaryEntry[];
	encoded: ScopedFormQuery;
	resultPreset?: ResultPreset;
};

export type CollectedFormValues = GatheredFormValues & {
	issues: FormIssue[];
};

type Sink = (emission: FormEmission) => void;
type GatherContext = {
	runtime: FormRuntimeContext;
	formState?: NewFormState;
	issues: FormIssue[];
	emissions: FormEmission[];
	summaries: SummaryEntry[];
	encoded: ScopedFormQuery;
	tabs: Set<string>;
	visitedFields: Set<FormFieldNode>;
	persistenceKeys: Map<string, FormFieldNode>;
	field?: FormFieldNode;
	resultPreset?: ResultPreset;
};

function reportIssue(context: GatherContext, nodeId: string, code: FormIssue['code'], message: string, output?: string, key?: string): void {
	context.issues.push({ stage: 'collect', code, nodeId, message, ...(output === undefined ? {} : { output }), ...(key === undefined ? {} : { key }) });
}

function reportError(context: GatherContext, nodeId: string, error: unknown, key?: string): void {
	reportIssue(context, nodeId, 'controller-error', error instanceof Error ? error.message : String(error), undefined, key);
}

function invoke(context: GatherContext, nodeId: string, callback: () => void): void {
	try {
		callback();
	} catch (error) {
		reportError(context, nodeId, error);
	}
}

function emitValue(context: GatherContext, nodeId: string, sink: Sink, declared: readonly FormOutputName[] | undefined, name: unknown, value: unknown): void {
	if (value === undefined) return;
	const emission = { name, value };
	if (!isValidEmission(emission)) {
		const knownName = typeof name === 'string' && isFormOutputName(name);
		reportIssue(
			context,
			nodeId,
			knownName ? 'malformed-output' : 'unknown-output',
			`Ignoring ${knownName ? 'malformed' : 'unknown'} output '${String(name)}'.`,
			typeof name === 'string' ? name : undefined,
		);
		return;
	}
	if (declared && !declared.includes(emission.name)) reportIssue(context, nodeId, 'undeclared-output', `Controller for '${nodeId}' emitted undeclared output '${emission.name}'.`, emission.name);
	sink(emission);
}

function addSummary(context: GatherContext, summary: SummaryEntry): void {
	const field = context.field;
	if (!field) throw new Error('Cannot summarize outside field collection.');
	const normalized: SummaryEntry = {
		...summary,
		summaryType: summary.summaryType === undefined ? [...field.controller.outputs] : [...summary.summaryType],
	};
	if (normalized.group === undefined) delete normalized.group;
	context.summaries.push(normalized);
}

const RESERVED_PERSISTENCE_KEYS = new Set(['form', 'tab']);

function persistField(context: GatherContext, field: FormFieldNode, state: unknown): void {
	let key: unknown;
	try {
		key = getFieldPersistKey(field, context.runtime);
	} catch (error) {
		reportError(context, field.id, error);
		return;
	}
	if (typeof key !== 'string' || !key) {
		reportIssue(context, field.id, 'malformed-output', `Field '${field.id}' has an invalid form persistence key.`, undefined, typeof key === 'string' ? key : undefined);
		return;
	}
	if (RESERVED_PERSISTENCE_KEYS.has(key)) {
		reportIssue(context, field.id, 'malformed-output', `Field '${field.id}' uses reserved form persistence key '${key}'.`, undefined, key);
		return;
	}
	const previous = context.persistenceKeys.get(key);
	if (previous) {
		reportIssue(context, field.id, 'malformed-output', `Duplicate form persistence key '${key}' for '${field.id}' and '${previous.id}'.`, undefined, key);
		return;
	}
	context.persistenceKeys.set(key, field);
	try {
		const value = encodeFieldState(field, state, context.runtime);
		if (value != null && value !== '') context.encoded[`f.${key}`] = value;
	} catch (error) {
		reportError(context, field.id, error, key);
	}
}

function visitField(node: FormFieldNode, state: unknown, context: GatherContext, sink: Sink, collectAuxiliary = true): void {
	if (context.field) throw new Error(`Cannot enter field '${node.id}' while collecting '${context.field.id}'.`);
	context.field = node;
	const emit = ((name: unknown, value: unknown) => {
		if (context.field !== node) throw new Error('Cannot emit outside field collection.');
		emitValue(context, node.id, sink, node.controller.outputs, name, value);
	}) as Emit;
	const firstVisit = !context.visitedFields.has(node);
	try {
		invoke(context, node.id, () => node.controller.collect(node, context.runtime, state, emit));
		if (!collectAuxiliary) return;
		if (firstVisit) {
			if (node.controller.summarize) invoke(context, node.id, () => node.controller.summarize!(node, context.runtime, state, summary => addSummary(context, summary)));
			persistField(context, node, state);
		}
		if (node.controller.getResultPreset) {
			invoke(context, node.id, () => {
				const preset = node.controller.getResultPreset!(node, context.runtime, state);
				if (context.resultPreset === undefined && preset !== undefined) context.resultPreset = preset;
			});
		}
	} finally {
		context.visitedFields.add(node);
		context.field = undefined;
	}
}

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

function visitContainer(node: Extract<FormNode, { kind: 'container' | 'form' }>, context: GatherContext, sink: Sink): void {
	const emissions: ScopedEmission[] = [];
	const scopedSink: Sink = emission => {
		if ((SCOPED_OUTPUTS as readonly FormOutputName[]).includes(emission.name)) emissions.push(emission as ScopedEmission);
		else sink(emission);
	};
	const selectedChild = node.children.find(child => child.id === context.formState?.uiState[node.id]);
	const activeProducer = selectedChild ? node.activeChildOutputProducers?.[selectedChild.id] : undefined;
	if (activeProducer) context.tabs.add(`${node.id}:${selectedChild!.id}`);

	for (const child of node.children) visitNode(child, context, scopedSink);
	if (activeProducer) invoke(context, node.id, () => activeProducer(((name: unknown, value: unknown) => emitValue(context, node.id, scopedSink, undefined, name, value)) as Emit));
	emitCombinedValues(node.kind === 'container' ? (node.combine ?? 'and') : 'and', emissions, sink);
}

function visitNode(node: FormNode, context: GatherContext, sink: Sink): void {
	if (node.kind === 'field') visitField(node, context.formState?.state[node.id], context, sink);
	else if (isContainerNode(node)) visitContainer(node, context, sink);
}

function gather(runtime: FormRuntimeContext, issues: FormIssue[], encoded: ScopedFormQuery, formState?: NewFormState): GatherContext {
	return {
		runtime,
		formState,
		issues,
		emissions: [],
		summaries: [],
		encoded,
		tabs: new Set(),
		visitedFields: new Set(),
		persistenceKeys: new Map(),
	};
}

function result(context: GatherContext): GatheredFormValues {
	if (context.tabs.size) context.encoded['f.tab'] = [...context.tabs];
	return {
		emissions: context.emissions,
		summaries: context.summaries,
		encoded: context.encoded,
		...(context.resultPreset !== undefined ? { resultPreset: context.resultPreset } : {}),
	};
}

export function collectFieldEmissions(node: FormFieldNode, state: unknown, runtime: FormRuntimeContext, issues: FormIssue[]): FormEmission[] {
	const context = gather(runtime, issues, {});
	visitField(node, state, context, emission => context.emissions.push(emission), false);
	return context.emissions;
}

export function collectFieldValues(node: FormFieldNode, state: unknown, runtime: FormRuntimeContext, issues: FormIssue[]): GatheredFormValues {
	const context = gather(runtime, issues, {});
	visitField(node, state, context, emission => context.emissions.push(emission));
	return result(context);
}

export function collectFormValues(node: FormBoundaryNode, formState: NewFormState, runtime: FormRuntimeContext): CollectedFormValues {
	const issues: FormIssue[] = [];
	const context = gather(runtime, issues, { 'f.form': node.id }, formState);
	visitNode(node, context, emission => context.emissions.push(emission));
	return { ...result(context), issues };
}

/** Check a field's validated semantic contributions without evaluating auxiliary channels. */
export function hasEmissions(field: FormFieldNode, state: unknown, runtime: FormRuntimeContext): boolean {
	return collectFieldEmissions(field, state, runtime, []).length > 0;
}
