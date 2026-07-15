/**
 * Whether the true value must fall wholly within, or only partially within,
 * the specified range.
 */
export type RangeMode = 'strict' | 'permissive';

export function isRangeMode(value: unknown): value is RangeMode {
	return value === 'strict' || value === 'permissive';
}
