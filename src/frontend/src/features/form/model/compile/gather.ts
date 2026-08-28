import { combineCqlPatterns } from '@/features/form/model/compile/query-artifact';
import { isContainerNode } from '@/features/form/model/form-utils';
import { FORM_QUERY_PREFIX, resolvePersistenceSchema, SCOPED_FORM_KEYS, type PersistenceSchema } from '@/features/form/model/persistence/schema';
import type { NewFormState } from '@/features/form/model/state';
import { encodeFieldState, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { isFormOutputName, isValidEmission, type Emit, type FormEmission, type FormIssue, type FormOutputName, type ResultPreset, type SummaryEntry } from '@/features/form/model/types/form-output';
import type { SummaryInput } from '@/features/form/model/types/form-output';
import { booleanNode, type CqlPatternNode, type LuceneNode } from '@/features/form/model/types/form-query-ir';
import type { ScopedFormQuery } from '@/features/form/model/types/form-result';
import type { FormBoundaryNode, FormFieldNode, FormNode, QueryCombineMode } from '@/features/form/model/types/form-shape';

type GatheredFormValues = {
	emissions: FormEmission[];
	summaries: SummaryEntry[];
	encoded: ScopedFormQuery;
	resultPreset?: ResultPreset;
};

export type CollectedFormValues = GatheredFormValues & {
	issues: FormIssue[];
};

type Sink = (emission: FormEmission) => void;
type GatherChannels = {
	summaries?: SummaryEntry[];
	persistence?: {
		encoded: ScopedFormQuery;
		keys: ReadonlyMap<FormFieldNode, string>;
		tabs: Set<string>;
	};
	resultPreset?: { value?: ResultPreset };
};
type GatherContext = {
	runtime: FormRuntimeContext;
	formState?: NewFormState;
	issues: FormIssue[];
	emissions: FormEmission[];
	channels: GatherChannels;
	visitedFields: Set<FormFieldNode>;
};

function reportIssue(context: GatherContext, severity: FormIssue['severity'], message: string): void {
	context.issues.push({ severity, message });
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

function addSummary(summaries: SummaryEntry[], field: FormFieldNode, summary: SummaryInput): void {
	const normalized: SummaryEntry = {
		...summary,
		summaryType: summary.summaryType === undefined ? [...field.controller.outputs] : [...summary.summaryType],
	};
	if (normalized.group === undefined) delete normalized.group;
	summaries.push(normalized);
}

function persistField(context: GatherContext, field: FormFieldNode, state: unknown): void {
	const persistence = context.channels.persistence;
	const key = persistence?.keys.get(field);
	if (!persistence || !key) return;
	try {
		const value = encodeFieldState(field, state, context.runtime);
		if (value != null && value !== '') persistence.encoded[`${FORM_QUERY_PREFIX}${key}`] = value;
	} catch (error) {
		reportIssue(context, 'error', `Could not persist '${key}' for controller '${field.id}': ${error instanceof Error ? error.message : String(error)}`);
	}
}

function visitField(node: FormFieldNode, state: unknown, context: GatherContext, sink: Sink): void {
	const emit = ((name: unknown, value: unknown) => {
		emitValue(context, node.id, sink, node.controller.outputs, name, value);
	}) as Emit;
	const firstVisit = !context.visitedFields.has(node);
	invoke(context, node.id, () => node.controller.collect(node, context.runtime, state, emit));
	if (firstVisit) {
		const summaries = context.channels.summaries;
		if (summaries && node.controller.summarize) invoke(context, node.id, () => node.controller.summarize!(node, context.runtime, state, summary => addSummary(summaries, node, summary)));
		if (context.channels.persistence) persistField(context, node, state);
	}
	if (context.channels.resultPreset && node.controller.getResultPreset) {
		invoke(context, node.id, () => {
			const preset = node.controller.getResultPreset!(node, context.runtime, state);
			if (context.channels.resultPreset!.value === undefined && preset !== undefined) context.channels.resultPreset!.value = preset;
		});
	}
	context.visitedFields.add(node);
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
	if (activeProducer) context.channels.persistence?.tabs.add(`${node.id}:${selectedChild!.id}`);

	for (const child of node.children) visitNode(child, context, scopedSink);
	if (activeProducer) invoke(context, node.id, () => activeProducer(((name: unknown, value: unknown) => emitValue(context, node.id, scopedSink, undefined, name, value)) as Emit));
	emitCombinedValues(node.kind === 'container' ? (node.combine ?? 'and') : 'and', emissions, sink);
}

function visitNode(node: FormNode, context: GatherContext, sink: Sink): void {
	if (node.kind === 'field') visitField(node, context.formState?.state[node.id], context, sink);
	else if (isContainerNode(node)) visitContainer(node, context, sink);
}

function gather(runtime: FormRuntimeContext, issues: FormIssue[], formState?: NewFormState, channels: GatherChannels = {}, schema?: PersistenceSchema): GatherContext {
	issues.push(...(schema?.issues ?? []));
	return {
		runtime,
		formState,
		issues,
		emissions: [],
		channels,
		visitedFields: new Set(),
	};
}

function result(context: GatherContext): GatheredFormValues {
	const summaries = context.channels.summaries ?? [];
	const persistence = context.channels.persistence;
	const encoded = persistence?.encoded ?? {};
	if (persistence?.tabs.size) encoded[`${FORM_QUERY_PREFIX}${SCOPED_FORM_KEYS.tabSelections}`] = [...persistence.tabs];
	return {
		emissions: context.emissions,
		summaries,
		encoded,
		...(context.channels.resultPreset?.value !== undefined ? { resultPreset: context.channels.resultPreset.value } : {}),
	};
}

export function collectFormValues(node: FormBoundaryNode, formState: NewFormState, runtime: FormRuntimeContext, schema = resolvePersistenceSchema(node, runtime)): CollectedFormValues {
	const issues: FormIssue[] = [];
	const context = gather(
		runtime,
		issues,
		formState,
		{
			summaries: [],
			persistence: { encoded: { [`${FORM_QUERY_PREFIX}${SCOPED_FORM_KEYS.formSelector}`]: node.id }, keys: schema.keys, tabs: new Set() },
			resultPreset: {},
		},
		schema,
	);
	visitNode(node, context, emission => context.emissions.push(emission));
	return { ...result(context), issues };
}

export function collectFormSummaryValues(node: FormBoundaryNode, formState: NewFormState, runtime: FormRuntimeContext): Pick<CollectedFormValues, 'emissions' | 'summaries' | 'issues'> {
	const issues: FormIssue[] = [];
	const context = gather(runtime, issues, formState, { summaries: [] });
	visitNode(node, context, emission => context.emissions.push(emission));
	return { emissions: context.emissions, summaries: context.channels.summaries!, issues };
}

/** Check a field's validated semantic contributions without evaluating auxiliary channels. */
export function hasEmissions(field: FormFieldNode, state: unknown, runtime: FormRuntimeContext): boolean {
	let hasEmission = false;
	visitField(field, state, gather(runtime, []), () => (hasEmission = true));
	return hasEmission;
}
