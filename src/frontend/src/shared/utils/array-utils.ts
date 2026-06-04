export type LenientArray<T> = T | Array<T | undefined | null> | undefined | null;
export function* lenientIter<T>(value: LenientArray<T>): Iterable<T> {
	if (value === undefined || value === null) return;
	if (Array.isArray(value)) {
		for (const v of value) {
			if (v !== undefined && v !== null) yield v;
		}
	} else {
		yield value;
	}
}
export function unwrapLenientArray<T>(value: LenientArray<T>): T[] {
	return Array.from(lenientIter(value));
}
