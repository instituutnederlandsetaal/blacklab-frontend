// TODO split this file into patternUtils (DONE - JN), groupUtils and generic utils.

import type * as AppTypes from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';

/**
 * @param context
 * @param prop - property to retrieve
 * @param doPunctBefore - add the leading punctuation?
 * @param addPunctAfter - trailing punctuation to append
 * @returns concatenated values of the property, interleaved with punctuation from context['punt']
 */
export function words(context: BLTypes.BLHitSnippetPart, prop: string, doPunctBefore: boolean, addPunctAfter: string): string {
	const parts = [] as string[];
	const n = context[prop] ? context[prop].length : 0;
	for (let i = 0; i < n; i++) {
		if ((i === 0 && doPunctBefore) || i > 0) {
			parts.push(context.punct[i]);
		}
		parts.push(context[prop][i]);
	}
	parts.push(addPunctAfter);
	return parts.join('');
}

/**
 * Decode a value as passed to BlackLab back into a value for the UI.
 * @param value the value to be parsed
 * @param type the type that the value should be parsed to, see uiType in the annotation object. Different annotation search widgets have different escaping properties (i.e. can they contain multiple values, or just one, etc.)
 */
export const decodeAnnotationValue = (value: string | string[], type: Required<AppTypes.AnnotationValue>['type']): { case: boolean; value: string } => {
	function isCase(v: string) {
		return v.startsWith('(?-i)') || v.startsWith('(?c)');
	}
	function stripCase(v: string) {
		return v.substr(v.startsWith('(?-i)') ? 5 : 4);
	}
	switch (type) {
		case 'text':
		case 'lexicon':
		case 'combobox': {
			let caseSensitive = false;
			const annotationValue = [value]
				.flat()
				.map(v => {
					if (isCase(v)) {
						v = stripCase(v);
						caseSensitive = true;
					}
					v = unescapeRegex(v, { escapePipes: false, escapeWildcards: false });
					// Only surround with quotes when we're joining multiple values into one string and this sub-value contains whitespace
					return Array.isArray(value) && v.match(/\s+/) ? `"${v}"` : v;
				})
				.join(' ');

			return {
				case: caseSensitive,
				value: annotationValue,
			};
		}
		case 'select': {
			value = Array.isArray(value) ? value[0] : value;
			const caseSensitive = isCase(value);
			value = caseSensitive ? stripCase(value) : value;
			value = unescapeRegex(value);
			return {
				case: caseSensitive,
				value,
			};
		}
		case 'pos': // pos is handled separately (url-state-parser)
		default:
			throw new Error('Unimplemented uitype query decoder');
	}
};

// --------------

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

/** Compile time checking: ensure the passed parameter is of the template type and return it (no-op).
 * Can use while setting variables initial value for example. */
export function cast<T>(t: T): T {
	return t;
}
