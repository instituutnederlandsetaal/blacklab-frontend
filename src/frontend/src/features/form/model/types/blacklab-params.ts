import type { BLCollocationScorer, BLCollocationType } from '@/types/blacklabtypes';

type SharedFormParams = Partial<{
	patt: string;
	filter: string;
	searchfield: string;
	withspans: true;
}>;

export type SearchParams = SharedFormParams &
	Partial<{
		group: string | null;
		sort: string | null;
	}> & { colltype?: never };

export type CollocationParams = SharedFormParams & {
	colltype: BLCollocationType;
	collpatt?: string;
	context?: number | string;
	within?: string;
	reltype?: string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
	sort?: string | null;
	group?: never;
};

export type FormParams = SearchParams | CollocationParams;

export function isCollocationParams(params: FormParams): params is CollocationParams {
	return params.colltype !== undefined;
}

export type FormOverrides = Partial<{
	patt: string;
	collpatt: string;
	filter: string;
	searchfield: string;
	withspans: true;
	colltype: BLCollocationType;
	context: number | string | null;
	within: string;
	reltype: string;
	annotation: string;
	sensitive: boolean;
}>;
