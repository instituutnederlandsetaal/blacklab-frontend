import type { KeysOfType } from '@/types/helpers';

export function filterDuplicates<T>(t: T[] | null | undefined, k: KeysOfType<T, string | number>): T[] {
	const found = new Set<T[KeysOfType<T, string | number>]>();
	return t
		? t.filter(v => {
				if (!found.has(v[k])) {
					found.add(v[k]);
					return true;
				}
				return false;
			})
		: [];
}

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

/**
 * Find a the index of a value in the array using binary search.
 * @param a the array to search in
 * @param compare compare the current element, should return a negative number if the wanted element comes before the current element, a positive number if it comes after, and 0 if it is the wanted element.
 * @returns the index of the element in the array, or the negative index where it should be inserted.
 */
export function binarySearch<T>(a: T[], compare: (el: T) => number) {
	let low = 0;
	let high = a.length - 1;

	while (low <= high) {
		let mid = Math.floor(low + (high - low) / 2);
		let midVal = a[mid];

		const cmp = compare(midVal);
		if (cmp > 0) low = mid + 1;
		else if (cmp < 0) high = mid - 1;
		else return mid; // key found
	}
	return -low; // key not found.
}
