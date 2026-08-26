import type { BLCollocationScorer, BLCollocationType } from '@/types/blacklabtypes';

export type SharedFormParams = Partial<{
	patt: string;
	filter: string;
	searchfield: string;
	group: string | null;
	sort: string | null;
	withspans: true;
}>;

export type SearchParams = SharedFormParams & { colltype?: never };

export type CollocationParams = SharedFormParams & {
	colltype: BLCollocationType;
	collpatt?: string;
	context?: number | string;
	within?: string;
	reltype?: string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
};

export type FormParams = SearchParams | CollocationParams;

export type RestorableFormParams = Partial<{
	patt: string;
	collpatt: string;
	filter: string;
	searchfield: string;
	withspans: true;
	colltype: BLCollocationType;
	within: string;
	reltype: string;
	annotation: string;
	sensitive: boolean;
	scorertype: string;
}>;

export const RESTORABLE_FORM_PARAMETERS = [
	'patt',
	'collpatt',
	'filter',
	'searchfield',
	'withspans',
	'colltype',
	'within',
	'reltype',
	'annotation',
	'sensitive',
	'scorertype',
] as const satisfies readonly (keyof RestorableFormParams)[];
export type RestorableFormParameter = (typeof RESTORABLE_FORM_PARAMETERS)[number];
export type RawFormOverrides = Partial<RestorableFormParams>;
