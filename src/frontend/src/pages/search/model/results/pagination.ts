export type ResultRange = { first: number; number: number };

/** Cover a selection with complete pages without changing the selection itself. */
export function expandResultRange(range: ResultRange, pageSize: number): ResultRange {
	const first = Math.floor(range.first / pageSize) * pageSize;
	return { first, number: Math.ceil((range.first + range.number) / pageSize) * pageSize - first };
}

/** Ordinary pages follow the preference; arbitrary imported selections retain their bounds. */
export function resizeResultRange(range: ResultRange, previousSize: number, pageSize: number): ResultRange {
	return range.first % previousSize === 0 && range.number === previousSize ? { first: Math.floor(range.first / pageSize) * pageSize, number: pageSize } : range;
}
