import type { GroupDisplayMode } from '@/features/search/model/results/result-types';
import type { BLCollocationScorer, BLCollocationType } from '@/types/blacklabtypes';

import type { CqlPatternNode, LuceneNode } from './form-query-ir';

export type CollocationContext = number | readonly [before: number, after: number];

export type FormOutputValues = {
	patt: CqlPatternNode;
	collpatt: CqlPatternNode;
	filter: LuceneNode;
	searchfield: string;
	group: readonly string[] | null;
	sort: readonly string[] | null;
	withspans: true;
	colltype: BLCollocationType;
	context: CollocationContext;
	within: string;
	reltype: string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
};

export const FORM_OUTPUT_NAMES = [
	'patt',
	'collpatt',
	'filter',
	'searchfield',
	'group',
	'sort',
	'withspans',
	'colltype',
	'context',
	'within',
	'reltype',
	'annotation',
	'sensitive',
	'scorertype',
] as const satisfies readonly (keyof FormOutputValues)[];

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

export type CompilationIssueCode = 'controller-error' | 'unknown-output' | 'undeclared-output' | 'unsupported-output' | 'malformed-output' | 'conflicting-output' | 'missing-output';

export type FormIssue = {
	stage: 'restore' | 'collect' | 'accept' | 'target';
	code: CompilationIssueCode | 'invalid-restored-state';
	message: string;
	key?: string;
	nodeId?: string;
	output?: string;
};

export type ResultPreset = {
	groupDisplayMode?: GroupDisplayMode | null;
};

export type SummaryType = FormOutputName;
export type SummaryEntry = {
	label: string;
	value: string;
	summaryType?: SummaryType[];
	group?: string;
};

/** Narrow names from untyped extension producers to the shared output vocabulary. */
export function isFormOutputName(value: string): value is FormOutputName {
	return (FORM_OUTPUT_NAMES as readonly string[]).includes(value);
}
