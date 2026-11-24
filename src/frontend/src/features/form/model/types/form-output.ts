import { isBLCollocationType } from '@/types/blacklabtypes';
import type { GroupDisplayMode } from '@/types/group-display-mode';

import type { FormOverrides } from './blacklab-params';
import { isCqlPatternNode, isLuceneNode, type CqlPatternNode, type LuceneNode } from './form-query-ir';

type CollocationContext = number | readonly [number, number];

function isSafeNonNegativeInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCollocationContext(value: unknown): value is CollocationContext {
	return isSafeNonNegativeInteger(value) || (Array.isArray(value) && value.length === 2 && value.every(isSafeNonNegativeInteger));
}

export type FormOutputValues = Required<Omit<FormOverrides, 'patt' | 'collpatt' | 'filter' | 'context'>> & {
	patt: CqlPatternNode;
	collpatt: CqlPatternNode;
	filter: LuceneNode;
	group: readonly string[] | null;
	sort: readonly string[] | null;
	context: CollocationContext;
};

export type FormOutputName = keyof FormOutputValues;
export type Emit = <Name extends FormOutputName>(name: Name, value: FormOutputValues[Name]) => void;
export type FormOutputProducer = (emit: Emit) => void;

export type FormEmission<Names extends FormOutputName = FormOutputName> = {
	[Name in Names]: {
		readonly name: Name;
		readonly value: FormOutputValues[Name];
	};
}[Names];

const OUTPUT_VALIDATORS: Record<FormOutputName, (value: unknown) => boolean> = {
	patt: isCqlPatternNode,
	collpatt: isCqlPatternNode,
	filter: isLuceneNode,
	searchfield: value => typeof value === 'string',
	group: value => value === null || (Array.isArray(value) && value.every(item => typeof item === 'string')),
	sort: value => value === null || (Array.isArray(value) && value.every(item => typeof item === 'string')),
	withspans: value => value === true,
	colltype: isBLCollocationType,
	context: isCollocationContext,
	within: value => typeof value === 'string',
	reltype: value => typeof value === 'string',
	annotation: value => typeof value === 'string',
	sensitive: value => typeof value === 'boolean',
};

/** Validate an emission against the shared output vocabulary. */
export function isValidEmission(emission: { name: unknown; value: unknown }): emission is FormEmission {
	return typeof emission.name === 'string' && isFormOutputName(emission.name) && OUTPUT_VALIDATORS[emission.name](emission.value);
}

export type FormIssue = {
	severity: 'warning' | 'error';
	message: string;
};

export type ResultPreset = GroupDisplayMode | null;

export type SummaryType = FormOutputName;
type SummaryValue = {
	label: string;
	value: string;
	group?: string;
};
export type SummaryInput = SummaryValue & { summaryType?: readonly SummaryType[] };
export type SummaryEntry = SummaryValue & { summaryType: readonly SummaryType[] };

/** Narrow names from untyped extension producers to the shared output vocabulary. */
export function isFormOutputName(value: string): value is FormOutputName {
	return Object.hasOwn(OUTPUT_VALIDATORS, value);
}
