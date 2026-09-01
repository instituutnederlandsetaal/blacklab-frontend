import type { BLCollocationScorer, BLCollocationsParameters, BLSearchParameters } from '@/types/blacklabtypes';

export type GroupDisplayMode = 'table' | 'docs' | 'hits' | 'relative docs' | 'relative hits' | 'tokens';

export type EffectiveCollocationParameters = Omit<BLCollocationsParameters, 'patt' | 'number' | 'colltype' | 'context' | 'annotation' | 'sensitive' | 'scorertype' | 'group' | 'viewgroup'> & {
	patt: string;
	number: number;
	colltype: 'proximity';
	context: number | string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
	group?: never;
	viewgroup?: never;
};

export type EffectiveSearchParameters = BLSearchParameters | EffectiveCollocationParameters;

export function isEffectiveCollocationParameters(params: EffectiveSearchParameters | null | undefined): params is EffectiveCollocationParameters {
	return params != null && 'colltype' in params && params.colltype === 'proximity';
}

export type ExecutedSearchRequest = { operation: 'hits' | 'docs'; params: BLSearchParameters } | { operation: 'collocations'; params: EffectiveCollocationParameters };
