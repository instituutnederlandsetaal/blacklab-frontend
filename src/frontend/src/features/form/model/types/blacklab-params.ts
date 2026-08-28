import type { BLCollocationScorer, BLCollocationType } from '@/types/blacklabtypes';

type SharedFormParams = Partial<{
	patt: string;
	filter: string;
	searchfield: string;
	group: string | null;
	sort: string | null;
	withspans: true;
}>;

export type SearchParams = SharedFormParams & { colltype?: never };

type CollocationParams = SharedFormParams & {
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
