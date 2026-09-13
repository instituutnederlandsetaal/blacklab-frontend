import type { BLCollocationOptions, BLSearchParameters } from '@/types/blacklabtypes';

export const SEARCH_STRING_PARAMS = ['patt', 'filter', 'searchfield'] as const;
export const COLLOCATION_STRING_PARAMS = ['patt', 'collpatt', 'filter', 'searchfield', 'within', 'reltype', 'annotation'] as const;

type SharedFormParams = Pick<BLSearchParameters, (typeof SEARCH_STRING_PARAMS)[number]> & { withspans?: true };

/** Omitted group/sort presets retain result controls; null clears them. */
export type SearchParams = SharedFormParams & { group?: string | null; sort?: string | null; colltype?: never };

export type CollocationParams = SharedFormParams &
	BLCollocationOptions &
	Required<Pick<BLCollocationOptions, 'colltype' | 'annotation' | 'sensitive' | 'scorertype'>> & { sort?: string | null; group?: never };

export type FormParams = SearchParams | CollocationParams;

/** Decoded form-owned request values are override candidates until compared with restored widgets.
 * A null context records an invalid URL value, so compilation cannot silently use its default. */
export type FormOverrides = Partial<Omit<CollocationParams, 'context' | 'group' | 'sort' | 'scorertype'>> & {
	context?: CollocationParams['context'] | null;
};
