import { combineCqlPatterns } from '@/features/form/model/compile/query-artifact';
import { isContainerNode } from '@/features/form/model/form-utils';
import type { FormStateInput } from '@/features/form/model/state';
import type { FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { isFormOutputName, type Emit, type FormEmission, type FormIssue, type FormOutputName, type RawEmission, type ResultPreset, type SummaryEntry } from '@/features/form/model/types/form-output';
import { booleanNode, isCqlPatternNode, isLuceneNode, type CqlPatternNode, type LuceneNode } from '@/features/form/model/types/form-query-ir';
import type { FormFieldNode, FormNode, QueryCombineMode } from '@/features/form/model/types/form-shape';

export type CollectedFormValues = {
	emissions: RawEmission[];
	summaries: SummaryEntry[];
	resultPreset?: ResultPreset;
	issues: FormIssue[];
};

type CollectionContext = {
	formState: FormStateInput;
	runtime: FormRuntimeContext;
	issues: FormIssue[];
	summarizedFields: Set<FormFieldNode>;
};

type CollectionBatch = Omit<CollectedFormValues, 'issues'>;

function controllerError(issues: FormIssue[], nodeId: string, error: unknown): void {
	issues.push({
		stage: 'collect',
		code: 'controller-error',
		nodeId,
		message: error instanceof Error ? error.message : String(error),
	});
}

function captureEmission(issues: FormIssue[], nodeId: string, declaredOutputs: ReadonlySet<FormOutputName> | null, name: unknown, value: unknown, target: RawEmission[]): void {
	if (typeof name !== 'string' || !isFormOutputName(name)) {
		issues.push({
			stage: 'collect',
			code: 'unknown-output',
			nodeId,
			output: typeof name === 'string' ? name : undefined,
			message: `Ignoring unknown output '${String(name)}'.`,
		});
		return;
	}
	if (declaredOutputs && !declaredOutputs.has(name)) {
		issues.push({
			stage: 'collect',
			code: 'undeclared-output',
			nodeId,
			output: name,
			message: `Controller for '${nodeId}' emitted undeclared output '${name}'.`,
		});
	}
	target.push({ name, value });
}

export function collectFieldValues(node: FormFieldNode, state: unknown, runtime: FormRuntimeContext, issues: FormIssue[], includeSummary = true): CollectionBatch {
	const emissions: RawEmission[] = [];
	const summaries: SummaryEntry[] = [];
	const declaredOutputs = new Set(node.controller.outputs);
	const emit = ((name: FormOutputName, value: never) => captureEmission(issues, node.id, declaredOutputs, name, value, emissions)) as Emit;

	try {
		node.controller.collect(node, runtime, state, emit);
	} catch (error) {
		controllerError(issues, node.id, error);
	}

	if (includeSummary && node.controller.summarize) {
		try {
			node.controller.summarize(node, runtime, state, summary => {
				const normalized = {
					...summary,
					summaryType: summary.summaryType === undefined ? [...node.controller.outputs] : [...summary.summaryType],
				};
				if (normalized.group === undefined) delete normalized.group;
				summaries.push(normalized);
			});
		} catch (error) {
			controllerError(issues, node.id, error);
		}
	}

	let resultPreset: ResultPreset | undefined;
	if (node.controller.getResultPreset) {
		try {
			const contribution = node.controller.getResultPreset(node, runtime, state);
			if (contribution?.groupDisplayMode !== undefined) resultPreset = { groupDisplayMode: contribution.groupDisplayMode };
		} catch (error) {
			controllerError(issues, node.id, error);
		}
	}
	return { emissions, summaries, resultPreset };
}

function isValidOutputValue(name: FormOutputName, value: unknown): boolean {
	switch (name) {
		case 'patt':
		case 'collpatt':
			return isCqlPatternNode(value);
		case 'filter':
			return isLuceneNode(value);
		case 'searchfield':
		case 'within':
		case 'reltype':
		case 'annotation':
		case 'scorertype':
			return typeof value === 'string';
		case 'group':
		case 'sort':
			return value === null || (Array.isArray(value) && value.every(item => typeof item === 'string'));
		case 'withspans':
			return value === true;
		case 'colltype':
			return value === 'proximity' || value === 'relsources' || value === 'reltargets';
		case 'context':
			return typeof value === 'number' || (Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number'));
		case 'sensitive':
			return typeof value === 'boolean';
	}
}

const SCOPED_OUTPUTS = new Set<FormOutputName>(['patt', 'collpatt', 'filter']);

function combineScopedEmissions(emissions: RawEmission[], combine: QueryCombineMode, issues: FormIssue[], nodeId: string): RawEmission[] {
	const values = new Map<FormOutputName, Array<{ index: number; emission: RawEmission }>>();
	const consumed = new Set<number>();
	for (let index = 0; index < emissions.length; index += 1) {
		const emission = emissions[index];
		if (!isFormOutputName(emission.name) || !SCOPED_OUTPUTS.has(emission.name)) continue;
		if (emission.value === undefined) {
			const entries = values.get(emission.name) ?? [];
			entries.push({ index, emission });
			values.set(emission.name, entries);
			continue;
		}
		if (!isValidOutputValue(emission.name, emission.value)) {
			consumed.add(index);
			issues.push({
				stage: 'collect',
				code: 'malformed-output',
				nodeId,
				output: emission.name,
				message: `Ignoring malformed '${emission.name}' output while collecting '${nodeId}'.`,
			});
			continue;
		}
		const entries = values.get(emission.name) ?? [];
		entries.push({ index, emission });
		values.set(emission.name, entries);
	}

	const replacements = new Map<number, RawEmission>();
	for (const [name, entries] of values) {
		for (const entry of entries) consumed.add(entry.index);
		const valid = entries.filter(entry => entry.emission.value !== undefined);
		if (!valid.length) {
			replacements.set(entries[0].index, entries[0].emission);
			continue;
		}
		let value: CqlPatternNode | LuceneNode | null;
		if (name === 'filter')
			value = booleanNode(
				combine === 'or' ? 'or' : 'and',
				valid.map(entry => entry.emission.value as LuceneNode),
			) as LuceneNode | null;
		else
			value = combineCqlPatterns(
				valid.map(entry => entry.emission.value as CqlPatternNode),
				combine,
			);
		if (value) replacements.set(valid[0].index, { name, value });
	}

	const result: RawEmission[] = [];
	for (let index = 0; index < emissions.length; index += 1) {
		const replacement = replacements.get(index);
		if (replacement) result.push(replacement);
		else if (!consumed.has(index)) result.push(emissions[index]);
	}
	return result;
}

function mergeBatches(batches: CollectionBatch[]): CollectionBatch {
	const preset = batches.find(batch => batch.resultPreset?.groupDisplayMode !== undefined)?.resultPreset;
	return {
		emissions: batches.flatMap(batch => batch.emissions),
		summaries: batches.flatMap(batch => batch.summaries),
		...(preset ? { resultPreset: preset } : {}),
	};
}

function collectNode(node: FormNode, context: CollectionContext): CollectionBatch {
	if (node.kind === 'field') {
		const includeSummary = !context.summarizedFields.has(node);
		context.summarizedFields.add(node);
		return collectFieldValues(node, context.formState.state[node.id], context.runtime, context.issues, includeSummary);
	}
	if (!isContainerNode(node)) return { emissions: [], summaries: [] };

	const childBatches = node.children.map(child => collectNode(child, context));
	const selectedChild = node.children.find(child => child.id === context.formState.uiState[node.id]);
	const activeProducer = selectedChild ? node.activeChildOutputProducers?.[selectedChild.id] : undefined;
	if (activeProducer) {
		const emissions: RawEmission[] = [];
		const emit = ((name: FormOutputName, value: never) => captureEmission(context.issues, node.id, null, name, value, emissions)) as Emit;
		try {
			activeProducer(emit);
		} catch (error) {
			controllerError(context.issues, node.id, error);
		}
		childBatches.push({ emissions, summaries: [] });
	}

	const batch = mergeBatches(childBatches);
	return {
		...batch,
		emissions: combineScopedEmissions(batch.emissions, node.kind === 'container' ? (node.combine ?? 'and') : 'and', context.issues, node.id),
	};
}

export function collectFormValues(node: FormNode, formState: FormStateInput, runtime: FormRuntimeContext): CollectedFormValues {
	const issues: FormIssue[] = [];
	const batch = collectNode(node, {
		formState,
		runtime,
		issues,
		summarizedFields: new Set(),
	});
	return { ...batch, issues };
}

export function acceptTargetEmissions<Names extends readonly FormOutputName[]>(emissions: readonly RawEmission[], acceptedOutputs: Names, issues: FormIssue[]): FormEmission<Names[number]>[] {
	const accepted = new Set<FormOutputName>(acceptedOutputs);
	const result: FormEmission<Names[number]>[] = [];
	for (const emission of emissions) {
		if (!isFormOutputName(emission.name)) continue;
		if (!accepted.has(emission.name)) {
			issues.push({
				stage: 'accept',
				code: 'unsupported-output',
				output: emission.name,
				message: `The form target does not accept output '${emission.name}'.`,
			});
			continue;
		}
		if (emission.value === undefined) continue;
		if (!isValidOutputValue(emission.name, emission.value)) {
			issues.push({
				stage: 'accept',
				code: 'malformed-output',
				output: emission.name,
				message: `Ignoring malformed output '${emission.name}'.`,
			});
			continue;
		}
		result.push(emission as FormEmission<Names[number]>);
	}
	return result;
}

export function countSummarizedFields(node: FormNode, formState: FormStateInput, runtime: FormRuntimeContext): number {
	let count = 0;
	const seen = new Set<FormFieldNode>();
	const visit = (current: FormNode): void => {
		if (current.kind === 'field') {
			if (seen.has(current)) return;
			seen.add(current);
			let active = false;
			try {
				current.controller.summarize?.(current, runtime, formState.state[current.id], () => {
					active = true;
				});
			} catch {
				return;
			}
			if (active) count += 1;
			return;
		}
		if (isContainerNode(current)) current.children.forEach(visit);
	};
	visit(node);
	return count;
}
