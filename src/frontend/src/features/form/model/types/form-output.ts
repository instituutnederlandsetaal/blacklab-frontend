import type { GroupDisplayMode } from '@/features/search/model/results/result-types';

import { isCqlPatternNode, isLuceneNode, type CqlPatternNode, type LuceneNode } from './form-query-ir';

export type FormOutputValues = {
	patt: CqlPatternNode;
	collpatt: CqlPatternNode;
	filter: LuceneNode;
	searchfield: string;
	group: readonly string[] | null;
	sort: readonly string[] | null;
	withspans: true;

	// Remaining collocation outputs are omitted until the collocation target is implemented.
};

const FORM_OUTPUT_NAMES = ['patt', 'collpatt', 'filter', 'searchfield', 'group', 'sort', 'withspans'] as const satisfies readonly (keyof FormOutputValues)[];

export type FormOutputName = keyof FormOutputValues;
export type Emit = <Name extends FormOutputName>(name: Name, value: FormOutputValues[Name]) => void;
export type FormOutputProducer = (emit: Emit) => void;

export type FormEmission<Names extends FormOutputName = FormOutputName> = {
	[Name in Names]: {
		readonly name: Name;
		readonly value: FormOutputValues[Name];
	};
}[Names];

export type RawEmission = Readonly<{ name: string; value: unknown }>;

const OUTPUT_VALIDATORS: Record<FormOutputName, (value: unknown) => boolean> = {
	patt: isCqlPatternNode,
	collpatt: isCqlPatternNode,
	filter: isLuceneNode,
	searchfield: value => typeof value === 'string',
	group: value => value === null || (Array.isArray(value) && value.every(item => typeof item === 'string')),
	sort: value => value === null || (Array.isArray(value) && value.every(item => typeof item === 'string')),
	withspans: value => value === true,
};

/** Validate an emission against the shared output vocabulary. */
export function isValidEmission(emission: { name: unknown; value: unknown }): emission is FormEmission {
	return typeof emission.name === 'string' && isFormOutputName(emission.name) && OUTPUT_VALIDATORS[emission.name](emission.value);
}

type CompilationIssueCode = 'controller-error' | 'unknown-output' | 'undeclared-output' | 'unexpected-output' | 'unsupported-output' | 'malformed-output' | 'conflicting-output' | 'missing-output';

export type FormIssue = {
	stage: 'restore' | 'collect' | 'accept' | 'target';
	code: CompilationIssueCode | 'invalid-restored-state';
	message: string;
	key?: string;
	nodeId?: string;
	output?: string;
};

export type ResultPreset = GroupDisplayMode | null;

export type SummaryType = FormOutputName;
export type SummaryEntry = {
	label: string;
	value: string;
	summaryType?: SummaryType[];
	group?: string;
};

type SummaryMatchingPolicy = Readonly<{ includeUntyped: boolean }>;

/** Match a summary to an output while making the fallback policy for missing or empty types explicit. */
export function summaryMatchesType(entry: SummaryEntry, type: SummaryType, { includeUntyped }: SummaryMatchingPolicy): boolean {
	return entry.summaryType?.length ? entry.summaryType.includes(type) : includeUntyped;
}

export function formatSummaryEntries(entries: readonly SummaryEntry[], type: SummaryType, policy: SummaryMatchingPolicy): string | undefined {
	const matching = entries.filter(entry => summaryMatchesType(entry, type, policy));
	return matching.length ? matching.map(entry => `${entry.label}: ${entry.value}`).join(', ') : undefined;
}

/** Narrow names from untyped extension producers to the shared output vocabulary. */
export function isFormOutputName(value: string): value is FormOutputName {
	return (FORM_OUTPUT_NAMES as readonly string[]).includes(value);
}
