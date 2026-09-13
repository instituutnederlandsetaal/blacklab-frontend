import type { BLCollocationScorer, BLCollocationsParameters, BLSearchParameters } from '@/types/blacklabtypes';

export type GroupDisplayMode = 'table' | 'docs' | 'hits' | 'relative docs' | 'relative hits' | 'tokens';

export type EffectiveCollocationParameters = BLCollocationsParameters & {
	number: number;
	colltype: 'proximity';
	context: number | string;
	annotation: string;
	sensitive: boolean;
	scorertype: BLCollocationScorer;
	group?: never;
};

export type EffectiveSearchParameters = BLSearchParameters | EffectiveCollocationParameters;

export function isEffectiveCollocationParameters(params: EffectiveSearchParameters | null | undefined): params is EffectiveCollocationParameters {
	return params != null && 'colltype' in params && params.colltype === 'proximity';
}

export type ExecutedSearchRequest = { operation: 'hits' | 'docs'; params: BLSearchParameters } | { operation: 'collocations'; params: EffectiveCollocationParameters };
