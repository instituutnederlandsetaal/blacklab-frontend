// TODO split this file into patternUtils (DONE - JN), groupUtils and generic utils.


import URI from 'urijs';

import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';
import Vue from 'vue';
import { corpusCustomizations } from '@/utils/customization';


const defaultRegexEscapeOptions = {
	/**
	 * In our inputs, wildcards are special characters that can be used to match any character or sequence of characters.
	 * Are wildcards supposed to be supported in the input? If so, set this to false.
	 *
	 * Defaults to true.
	 * If true, wildcards are escaped:
	 * - * is replaced with \*
	 * - ? is replaced with \?
	 * If false, wildcards are activated:
	 * - * is replaced with .*
	 * - ? is replaced with .
	 */
	escapeWildcards: true,
	/** Default to true. If true, escape | to \|. If false, leave alone. */
	escapePipes: true,
	/** Defaults to true. If true, escape " to \". If false, leave alone. */
	escapeQuotes: true
}
export type RegexEscapeOptions = Partial<typeof defaultRegexEscapeOptions>;
export function escapeRegex(value: string, settings: RegexEscapeOptions = {}) {
	settings = {...defaultRegexEscapeOptions, ...settings};


	// NOTE: take special care for characters we might let through.
	// We want to be able to also let the user search for those characters verbatim.
	// In which case they will have to escape them using a backslash.
	// We must make sure that we do not double escape these already-present backslashes (but only when they're meaningful.)
	// There might be a better way to accomplish this, but for now we'll just replace them with a placeholder and replace them back afterwards.

	const specialEscapeSequences = [
		{ input: '\\|', output: '__PIPE__', active: !settings.escapePipes},
		{ input: '\\*', output: '__STAR__', active: !settings.escapeWildcards},
		{ input: '\\?', output: '__QUESTION__', active: !settings.escapeWildcards},
		{ input: '\\"', output: '__QUOTE__', active: !settings.escapeQuotes}
	];
	for (const {input, output, active} of specialEscapeSequences) {
		if (active) value = value.replaceAll(input, output);
	}

	const escapeBase = (s: string) => s.replace(/([\\^$#@&+.(){}[\]])/g, '\\$1');
	const escapeWildcards = (s: string) => s.replace(/([*?])/g, '\\$1');
	const activateWildcards = (s: string) => s.replace(/\*/g, '.*').replace(/\?/g, '.');
	const escapePipes = (s: string) => s.replace(/\|/g, '\\|');
	const escapeQuotes = (s: string) => s.replace(/"/g, '\\"');
	const identity = (s: string) => s;

	const operations = [
		escapeBase,
		settings.escapeWildcards ? escapeWildcards : activateWildcards,
		settings.escapePipes ? escapePipes : identity,
		settings.escapeQuotes ? escapeQuotes : identity
	]

	value = operations.reduce((acc, op) => op(acc), value);
	// Unescape the special escape sequences
	for (const {input, output, active} of specialEscapeSequences) {
		if (active) value = value.replaceAll(output, input);
	}
	return value;
}

export function unescapeRegex(value: string, settings: RegexEscapeOptions = {}) {
	settings = {...defaultRegexEscapeOptions, ...settings};

	// NOTE: take special care for characters we might let through.
	// We want to be able to also let the user search for those characters verbatim.
	// In which case they will have to escape them using a backslash.
	// We must make sure that we do not remove these already-present backslashes (but only when they're meaningful.)
	// There might be a better way to accomplish this, but for now we'll just replace them with a placeholder and replace them back afterwards.
	const specialEscapeSequences = [
		{ input: '\\|', output: '__PIPE__', active: !settings.escapePipes},
		{ input: '\\*', output: '__STAR__', active: !settings.escapeWildcards},
		{ input: '\\?', output: '__QUESTION__', active: !settings.escapeWildcards},
		{ input: '\\"', output: '__QUOTE__', active: !settings.escapeQuotes}
	];
	for (const {input, output, active} of specialEscapeSequences) {
		if (active) value = value.replaceAll(input, output);
	}

	const unescapeBase = (s: string) => s.replace(/\\([\\^$#@&+.(){}[\]])/g, '$1');
	const unescapeWildcards = (s: string) => s.replace(/\\([*?])/g, '$1');
	const deactivateWildcards = (s: string) => s.replace(/\.\*/g, '*').replace(/\./g, '?');
	const unescapePipes = (s: string) => s.replace(/\\[|]/g, '|');
	const unescapeQuotes = (s: string) => s.replace(/\\"/g, '"');
	const identity = (s: string) => s;

	// in reverse order, otherwise the base unescape could produce something that looks like a wildcard
	const operations = [
		settings.escapeQuotes ? unescapeQuotes : identity,
		settings.escapePipes ? unescapePipes : identity,
		settings.escapeWildcards ? unescapeWildcards : deactivateWildcards,
		unescapeBase
	]

	value = operations.reduce((acc, op) => op(acc), value);
	// Unescape the special escape sequences
	for (const {input, output, active} of specialEscapeSequences) {
		if (active) value = value.replaceAll(output, input);
	}
	return value;
}

/**
 * Escapes the lucene term. This is done by surrounding it by quotes, unless wildcards (* and ?) should be preserved,
 * in which case characters are escaped on an individual basis.
 * Preserving wildcards is only possible when the string does not contain whitespace, as that is the term delimited and cannot be escaped
 * except by surrounding the term with quotes, which implicitly escapes wildcards.
 *
 * The resultant string should NOT need to be be surrounded by quotes again.
 */
export function escapeLucene(original: string, preserveWildcards: boolean) {
	if (!preserveWildcards || original.match(/\s+/)) {
		return `"${original.replace(/(")/g, '\\$1')}"`;
	}
	return original.replace(/(\+|-|&&|\|\||!|\(|\)|{|}|\[|]|\^|"|~|:|\\|\/)/g, '\\$1');
}

/** Unescapes every lucene special character including double quotes, except wildcards */
export function unescapeLucene(original: string) {
	if (original.startsWith('"') && original.endsWith('"') && !original.endsWith('\\"')) {
		return original.substr(1, original.length - 2).replace(/\\(")/g, '$1');
	}

	return original.replace(/\\(\+|-|&&|\|\||!|\(|\)|{|}|\[|]|\^|"|~|:|\\|\/|\*|\?)/g, '$1');
}

export function NaNToNull(n: number) { return isNaN(n) ? null : n; }


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
export const decodeAnnotationValue = (value: string|string[], type: Required<AppTypes.AnnotationValue>['type']): {case: boolean; value: string} => {
	function isCase(v: string) { return v.startsWith('(?-i)') || v.startsWith('(?c)'); }
	function stripCase(v: string) { return v.substr(v.startsWith('(?-i)') ? 5 : 4); }
	switch (type) {
		case 'text':
		case 'lexicon':
		case 'combobox': {
			let caseSensitive = false;
			const annotationValue = [value].flat().map(v => {
				if (isCase(v)) {
					v = stripCase(v);
					caseSensitive = true;
				}
				v = unescapeRegex(v, {escapePipes: false, escapeWildcards: false});
				// Only surround with quotes when we're joining multiple values into one string and this sub-value contains whitespace
				return Array.isArray(value) && v.match(/\s+/) ? `"${v}"` : v;
			}).join(' ');

			return {
				case: caseSensitive,
				value: annotationValue
			};
		}
		case 'select': {
			value = Array.isArray(value) ? value[0] : value;
			const caseSensitive = isCase(value);
			value = caseSensitive ? stripCase(value) : value;
			value = unescapeRegex(value);
			return {
				case: caseSensitive,
				value
			};
		}
		case 'pos': // pos is handled separately (url-state-parser)
		default: throw new Error('Unimplemented uitype query decoder');
	}
};

type SplitString = {
	start: number;
	end: number;
	value: string;
	isQuoted: boolean;
};

/**
 * Split a search pattern string into its terms.
 * For example strings input in the "Simple Search" input.
 * This works by splitting the string on all whitespace (ignoring it), except where (a part of) the string is enclosed in double quotes (""), between which whitespace is preserved.
 * Double quotes and whitespace that has been used as separator is stripped from the value field of the returned structs.
 * Stripped quotes (not whitespace!) are however still reflected in the start and end properties. (meaning for a string that isQuoted, (end-start) === (value.length + 2))
 * This is because this function is also used to split out (and replace) the currently selected word/sequence of words for autocompleted annotations.
 * Note: quote escaping is not taken into consideration. Backslashes are treated as any other character
 * Examples:
 * "split word" behind another few --> ["split word", "behind", "another", "few"]
 * "wild* in split words" and such --> ["wild.* in split words", "and", "such"]
 * @param v the input string.
 * @param useQuoteDelimiters whether to use double quotes (") as delimiters or not. If not, the quotes are treated as regular characters.
 */
export const splitIntoTerms = (value: string, useQuoteDelimiters: boolean): SplitString[]  => {
	let i = 0;
	let inQuotes = false;
	let seg = '';
	let start = 0;
	let segs: Array<{start: number, end: number, value: string, isQuoted: boolean}> = [];
	for (const c of value) {
		switch (c) {
			case '"':
				if (useQuoteDelimiters) {
					// start or end of section (possibly both?)
					if (seg) {
						segs.push({start, end: i+1, value: seg, isQuoted: inQuotes})
						seg = '';
					}
					inQuotes = !inQuotes;
					start = i;
				} else {
					seg += c;
				}
				break;
			case ' ':
			case '\t':
			case '\r':
			case '\n':
			case '\f':
			case '\v':
				if (inQuotes) seg += c;
				else if (seg) {
					// this character is already no longer a part of the segment - hence no +1 on end
					segs.push({start, end: i, value: seg, isQuoted: inQuotes});
					seg = '';
				}
				break;
				// ignorable whitespace
			default:
				if (!seg && !inQuotes) start = i;
				seg += c;
				break;
		}
		++i;
	}
	if (seg) {
		segs.push({start, end: i+1, value: seg, isQuoted: inQuotes});
		seg = '';
	}
	return segs;
};

[{
	value: '"the simplest"',
	expect: [{
		start: 0,
		end: 14,
		value: 'the simplest',
		isQuoted: true
	}]
}, {
	value: 'this is " a test """ ',
	expect: [{
		start: 0,
		end: 4,
		value: 'this'
	}, {
		start: 5,
		end: 7,
		value: 'is'
	}, {
		start: 8,
		end: 18,
		value: ' a test ',
		isQuoted: true
	}]
}, {
	value: 'regular string',
	expect: [{
		start: 0,
		end: 7,
		value: 'regular'
	}, {
		start: 8,
		end: 14,
		value: 'string'
	}]
}, {
	value: '  starting with a few \t spaces \r\nhelp',
	expect: [{
		start: 2,
		end: 10,
		value: 'starting'
	}, {
		start: 11,
		end: 15,
		value: 'with'
	}, {
		start: 16,
		end: 17,
		value: 'a'
	}, {
		start: 18,
		end: 21,
		value: 'few'
	}, {
		start: 24,
		end: 30,
		value: 'spaces'
	}, {
		start: 33,
		end: 37,
		value: 'help'
	}]
},{
	value: '"normal everyday" string "with some quotes"',
	expect: [{
		start: 0,
		end: 17,
		value: 'normal everyday',
		isQuoted: true
	}, {
		start: 19,
		end: 24,
		value: 'string'
	}, {
		start: 26,
		end: 44,
		value: 'with some quotes',
		isQuoted: true
	}]
}].forEach(({value: fullValue, expect}) => {
	const split = splitIntoTerms(fullValue, true);
	split.forEach((part, index) => {
		const {start, end, value, isQuoted} = expect[index];
		const expand = part.isQuoted ? 1 : 0;
		if (fullValue.substring(part.start + expand, part.end - expand) !== value) {
			console.log('part: ', part, 'expect: ', expect[index]);
		}
	})
});

/** Parenthesize part of a BCQL query if it's not already */
export function parenQueryPart(query: string, exceptions: string[] = []) {
	query = query.trim();
	if (query.match(/^\(.+\)$/) || query.match(/^\[[^\]]*\]$/) || exceptions.includes(query)) {
		return query;
	}
	return `(${query})`;
}

export function parenQueryPartParallel(query: string) {
	const parenExceptions = ['[]*', '_'];
	return parenQueryPart(query === '[]*' ? '_' : query, parenExceptions);
}

/** Remove parentheses from a BCQL query part if it's parenthesized and doesn't
 *  contain nested parens.
 */
export function unparenQueryPart(query?: string) {
	if (query) {

		query = query.trim();
		while (query.match(/^\([^\(\)]*\)$/)) {
			query = query.substring(1, query.length - 1).trim();
		}
	}
	return query;
}

export function applyWithinClauses(query: string, withinClauses: Record<string, Record<string, any>>) {
	const overlapClauses = Object.entries(withinClauses)
		.map(([elName, attributes]) => {
			const attr = attributes ?
			Object.entries(attributes).filter(([k, v]) => !!v)
				.map(([k, v]) => {
					if (typeof v === 'string') {
						// Regex query
						return ` ${k}="${v.replace(/"/g, '\\"')}"`;
					} else if (v.low || v.high) {
						// Range query
						return ` ${k}=in[${v.low || 0},${v.high || 9999}]`;
					} else
						return '';
				})
				.join('') : '';
			return `<${elName}${attr}/>`;
		})
		.join(' overlap ');
	if (query.length > 0 && overlapClauses.length > 0)
		return `(${query}) within ${overlapClauses}`;
	return query.length > 0 ? query : overlapClauses;
}

export function getDocumentUrl(
	pid: string,
	/** Field for which to show the document contents (important when this is a parallel corpus, as there are multiple "copies" of the same document then, e.g. an English and Dutch version) */
	fieldName?: string,
	/** Field on which the cql query is run. if searchfield differs from field (parallel corpus) */
	searchField?: string,
	cql?: string,
	pattgapdata?: string,
	/** HACK: make the backend figure out which page to display based on the start index of the hit -- see ArticlePagination.vue/PaginationInfo.java */
	findhit?: number
) {

	cql = (cql || '').trim();
	pattgapdata = (pattgapdata || '').trim();
	if ((cql.length + pattgapdata.length) > 1000) { // server has issues with long urls
		cql = undefined;
		pattgapdata = undefined;
	}

	return new URI()
	.segment([CONTEXT_URL, INDEX_ID, 'docs', pid])
	.search({
		// parameter 'query' controls the hits that are highlighted in the document when it's opened
		field: fieldName,
		searchfield: searchField,
		query: cql || undefined,
		pattgapdata: pattgapdata || undefined,
		findhit
	}).toString();
}

type KeysOfType<Base, Condition> = keyof Pick<Base, {
	[Key in keyof Base]: Base[Key] extends Condition ? Key : never
}[keyof Base]>;

/**
 * Returns a reducer function that will place all values into a map/object at the key defined by the passed string.
 * @param k key to pick from the objects
 * @param m optional mapping function to transform the objects after picking the key
 */
export function makeMapReducer<T, V extends (t: T, i: number) => any = (t: T, i: number) => T>(k: KeysOfType<T, string>, m?: V): (m: Record<string, ReturnType<V>>, t: T, i: number) => Record<string, ReturnType<V>> {
	return (acc: Record<string, ReturnType<V>>, v: T, i: number): Record<string, ReturnType<V>> => {
		const kv = v[k] as any as string;
		acc[kv] = m ? m(v, i) : v;
		return acc;
	};
}

export function makeMultimapReducer<T, V extends (t: T, i: number) => any = (t: T, i: number) => T>(k: KeysOfType<T, string>, m?: V): (m: Record<string, Array<ReturnType<V>>>, t: T, i: number) => Record<string, Array<ReturnType<V>>> {
	return (acc: Record<string, Array<ReturnType<V>>>, v: T, i: number): Record<string, Array<ReturnType<V>>> => {
		const kv = v[k] as any as string;
		acc[kv] ? acc[kv].push(m ? m(v, i) : v) : acc[kv] = [m ? m(v, i) : v];
		return acc;
	};
}

/**
 * Turn an array of strings into a map of type {[key: string]: true}.
 * Optionally mapping the values to be something other than "true".
 *
 * @param t the array of strings to place in a map.
 * @param m (optional) a mapping function to apply to values.
 */
export function mapReduce<VS extends (t: string, i: number) => any = (t: string, i: number) => true>(t: string[]|undefined|null, m?: VS): Record<string, ReturnType<VS>>;
/**
 * Turn an array of type T[] into a map of type {[key: string]: T}.
 * Optionally mapping the values to be something other than T.
 *
 * @param t the array of objects to place in a map.
 * @param k a key in the objects to use as key in the map.
 * @param m (optional) a mapping function to apply to values.
 */
export function mapReduce<T, VT extends (t: T, i: number) => any = (t: T, i: number) => T>(t: T[]|undefined|null, k: KeysOfType<T, string>, m?: VT): Record<string, ReturnType<VT>>;
export function mapReduce<
	T,
	VT extends (t: T, i: number) => any = (t: T, i: number) => T,
	VS extends (t: string, i: number) => any = (t: string, i: number) => true
>(
	t: string[]|T[]|undefined|null,
	a?: VS|KeysOfType<T, string>,
	b?: VT
): any {
	if (t && t.length > 0 && typeof t[0] === 'string') {
		const values = t as string[];
		const mapper = a as VS|undefined;
		return values.reduce<Record<string, ReturnType<VS>>>((acc, cur, index) => {
			acc[cur] = mapper ? mapper(cur, index) : true;
			return acc;
		}, {});
	} else {
		const values = t as T[]|undefined|null;
		const key = a as KeysOfType<T, string>;
		const mapper = b as VT|undefined;
		return values ? values.reduce(makeMapReducer<T, VT>(key, b), {}) : {};
	}
}

/**
 * Turn an array of type T[] into a map of type {[key: string]: T[]};
 * Duplicate keys will be pushed into the array at that key in order of appearance.
 *
 * @param t the array of objects to place in a map.
 * @param k a key in the objects to use as key in the map.
 * @param m (optional) a mapping function to apply to values.
 */
export function multimapReduce<T, V extends (t: T, i: number) => any = (t: T, i: number) => T>(t: T[]|undefined|null, k: KeysOfType<T, string>, m?: V): Record<string, Array<ReturnType<V>>> {
	return t ? t.reduce(makeMultimapReducer<T, V>(k, m), {}) : {};
}

export function filterDuplicates<T>(t: T[]|null|undefined, k: KeysOfType<T, string|number>): T[] {
	const found = new Set<T[KeysOfType<T, string|number>]>();
	return t ? t.filter(v => {
		if (!found.has(v[k])) {
			found.add(v[k]);
			return true;
		}
		return false;
	}) : [];
}

// --------------

/** Groups always have at least one member, empty array is returned if no groups would have members. */
export function fieldSubset<T extends {id: string}>(
	ids: string[],
	groups: Array<{id: string, entries: string[]}>,
	fields: Record<string, T>,
	addAllToOneGroup?: string
): Array<{id: string, entries: T[]}> {
	let ret: Array<{id: string, entries: T[]}> = groups
	.map(g => ({
		id: g.id,
		entries: g.entries.filter(e => ids.includes(e)).map(id => fields[id]),
	}))
	.filter(g => g.entries.length);

	if (addAllToOneGroup != null) {
		const seenIds = new Set<string>();
		const asOneGroup = { id: addAllToOneGroup, entries: [] as T[] };
		ret.forEach(group => {
			const unseenEntriesInGroup = group.entries.filter(entry => {
				const seen = seenIds.has(entry.id);
				seenIds.add(entry.id);
				return !seen;
			});
			asOneGroup.entries.push(...unseenEntriesInGroup);
		});
		ret = asOneGroup.entries.length ? [asOneGroup] : [];
	}
	return ret;
}

/**
 * Given a list of metadata IDs, and some metadata about the corpus, convert them to a list of options for a <SelectPicker/>, or for rendering the fields in a list-type fashion.
 * 
 * NOTE:
 * The type of the field objects is a little more generic than a metadata field
 * because this function can also be used with filters. Which do not 100% overlap with metadata fields necessarily.
 * (although in the vast majority of cases, filters are created from metadata fields).
 * (but for example a date range filter has two underlying metadata fields, so it requires a custom id that doesn't exist in the metadata)
 * 
 * @param ids the list of metadata IDs to keep
 * @param groups how metadata in the corpus is grouped into subsections.
 * @param metadata all metadata fields in the corpus
 * @param operation What section of the interface to generate the options list for: 'Sort' will generate additional entries to sort in reverse order, and 'Group' is just to generate appropriate option labels "Group by ...".
 * @param i18n the Vue instance to use for i18n
 * @param debug is debug mode enabled? print raw IDS in suffix labels
 * @param showGroupLabels show little group name suffixes at the end of options?
 * @param showFieldFunction a function that returns whether a field should be shown in the list of options. If not provided, all requested fields are shown. For 'customization' (see customization.ts).
 */
export function getMetadataSubset<T extends {id: string, defaultDisplayName?: string}>(
	ids: string[],
	groups: AppTypes.NormalizedMetadataGroup[],
	metadata: Record<string, T>,
	operation: 'Sort'|'Group',
	i18n: Vue,
	debug = false,
	/* show the <small/> labels at the end of options labels? */
	showGroupLabels = true,
	showFieldFunction?: (id: string) => boolean|null
): Array<AppTypes.OptGroup&{entries: T[]}> {
	const subset = fieldSubset(ids, groups, metadata);

	// Map a metadata field's id + displayname + group to an option for rendering a groupby or sortby dropdown.
	// This will map the value to be the string required for blacklab to sort/group by the field
	// and the label to be the human-readable display name of the field.
	function mapToOptions(value: string, displayName: string, groupId: string): AppTypes.Option[] {
		const displayIdHtml = debug ? `<small><strong>[id: ${value}]</strong></small>` : '';
		const displayNameHtml = displayName || value;
		const displaySuffixHtml = showGroupLabels && groupId ? `<small class="text-muted">${groupId}</small>` : '';
		const r: AppTypes.Option[] = [];
		const labelI18nKey = operation === 'Sort' ? 'results.table.sortBy' : 'results.table.groupBy';
		r.push({
			value: operation === 'Sort' ? `field:${value}` : value, // groupby prepends field: on its own
			label: i18n.$t(labelI18nKey, {field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}`}).toString(),
		});
		if (operation === 'Sort') {
			r.push({
				value: `-field:${value}`,
				label: i18n.$t('results.table.sortByDescending', {field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}`}).toString(),
			});
		}
		return r;
	}

	const r = subset.map<AppTypes.OptGroup&{entries: T[]}>(group => ({
		options: group.entries
			.filter(e => showFieldFunction?.(e.id) ?? true)
			.flatMap(e => mapToOptions(e.id, i18n.$tMetaDisplayName(e), i18n.$tMetaGroupName(group.id))),
		entries: group.entries,
		label: i18n.$tMetaGroupName(group.id)
	}));

	return r;
}

/**
 * Given a list of annotation IDs, and some metadata about the corpus & annotations, convert them to a list of options for a <SelectPicker/>
 * @param ids the list of annotation IDs to keep
 * @param groups how annotations in the corpus are grouped into subsections. An annotation may be part of multiple groups.
 * @param annotations all annotations in the corpus
 * @param operation What section of the interface to generate the options list for: 'Search' will output every annotation only once per group, 'Sort' will generate additional entries to sort in reverse order, and 'Group' is just to generate appropriate option labels "Group by ...".
 * @param corpusTextDirection important for the order of left/right context sorting
 * @param debug is debug mode enabled? print raw annotation IDS in labels
 * @param showGroupLabels show little group name suffixes at the end of options?
 */
export function getAnnotationSubset(
	ids: string[],
	groups: AppTypes.NormalizedAnnotationGroup[],
	annotations: Record<string, AppTypes.NormalizedAnnotation>,
	operation: 'Search'|'Sort',
	i18n: Vue,
	corpusTextDirection: 'rtl'|'ltr' = 'ltr',
	debug = false,
	showGroupLabels = false
): Array<AppTypes.OptGroup&{entries: AppTypes.NormalizedAnnotation[]}> {
	function findAnnotatedFieldId(groupId: string) {
		return groups.find(g => g.id === groupId)?.annotatedFieldId || groups[0].annotatedFieldId;
	}

	const subset = fieldSubset(ids, groups, annotations, operation !== 'Search' ? 'Other' : undefined);
	if (operation === 'Search')	{
		return subset.map(group => {
			const annotationGroupMock: AppTypes.NormalizedAnnotationGroup = {
				annotatedFieldId: findAnnotatedFieldId(group.id),
				entries: [],
				id: group.id,
				isRemainderGroup: false
			}
			const groupNameLocalized = i18n.$tAnnotGroupName(annotationGroupMock);

			return {
				entries: group.entries,
				options: group.entries.map(a => ({
					value: a.id,
					label: i18n.$tAnnotDisplayName(a) + (showGroupLabels ? ` <small class="text-muted">${groupNameLocalized}</small>` : '') + (debug ? ` <small><strong>[id: ${a.id}]</strong></small>` : ''),
					title: i18n.$tAnnotDescription(a)
				})),
				// hack, when using a default group we need to come up with an annotated field
				// So just use the first annotated field we come across.
				label: i18n.$tAnnotGroupName({id: group.id, annotatedFieldId: findAnnotatedFieldId(group.id), entries: [], isRemainderGroup: false}),
			}
		});
	} else {
		// Generate options for sorting by annotation.
		// I.e. 6 options per annotation. 3 for each position: before, hit, after
		// and 2 per postion: ascending and descending.
		return [
			['hit:', 'Hit', ''],
			[corpusTextDirection === 'rtl' ? 'right:' : 'left:', 'Before hit', 'before'],
			[corpusTextDirection === 'rtl' ? 'left:' : 'right:', 'After hit', 'after']
		]
		.map<AppTypes.OptGroup&{entries: AppTypes.NormalizedAnnotation[]}>(([prefix, groupname, suffix]) =>({
			label: groupname,
			entries: subset[0].entries,
			options: ids.flatMap<AppTypes.Option>(id => {
				// in debug mode - show IDs
				const displayIdHtml = debug ? `<small><strong>[id: ${id}]</strong></small>` : '';
				const displayNameHtml = i18n.$tAnnotDisplayName(annotations[id]);
				const displaySuffixHtml = (showGroupLabels && suffix) ? `<small class="text-muted">${suffix}</small>` : '';

				return [{
					label: i18n.$t('results.table.sortBy', {field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}`}).toString(),
					value: `${prefix}${id}`
				}, {
					label: i18n.$t('results.table.sortByDescending', {field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}`}).toString(),
					value: `-${prefix}${id}`
				}]
			})
		}));
	}

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
		let mid = Math.floor(low + ((high - low) / 2));
		let midVal = a[mid];

		const cmp = compare(midVal);
		if (cmp > 0)
			low = mid + 1
		else if (cmp < 0)
			high = mid - 1;
		else
			return mid; // key found
	}
	return -low;  // key not found.
}

export function uniq<T>(l: T[]): T[] {return Array.from(new Set(l)).sort() }

/** Compile time checking: ensure the passed parameter is of the template type and return it (no-op).
 * Can use while setting variables initial value for example. */
export function cast<T>(t: T): T { return t; }

export const uiTypeSupport: {[key: string]: {[key: string]: Array<AppTypes.NormalizedAnnotation['uiType']>}} = {
	search: {
		simple: ['combobox', 'select', 'lexicon'],
		extended: ['combobox', 'select', 'pos'],
	},
	explore: {
		ngram: ['combobox', 'select']
	}
};

export function getCorrectUiType<T extends AppTypes.NormalizedAnnotation['uiType']>(allowed: T[], actual: T): T {
	return allowed.includes(actual) ? actual : 'text' as any;
}

// Must be here to avoid recursive dependencies
export const PARALLEL_FIELD_SEPARATOR = '__';

/**
 * Given a parallel field name, return the prefix and version parts separately.
 *
 * For example, for field name "contents__en", will return prefix "contents" and
 * version "en".
 *
 * For a non-parallel field name, the version part will be an empty string.
 *
 * @param fieldName parallel field name
 * @returns an object containing the prefix and version.
 */
export function getParallelFieldParts(fieldName: string) {
	const parts = fieldName.split(PARALLEL_FIELD_SEPARATOR, 2);
	if (parts.length === 1) {
		// non-parallel field; return empty string as version
		parts.push('');
	}
	return {
		/** The base field, e.g. "contents" */
		prefix: parts[0],
		/** The suffix, e.g. "en" or "nl". Empty string when the field is not parallel. */
		version: parts[1]
	};
}

/** Get the full name of a parallel annotatedField, consisting of the base name/prefix and the version (e.g. "en", "nl") */
export function getParallelFieldName(prefix: string, version: string) {
	return `${prefix}${PARALLEL_FIELD_SEPARATOR}${version}`;
}

/** If passed only a version name: prefix it with the field name from defaultFieldName.
 *
 *  So:
 *  <code>ensureCompleteFieldName('en',          'contents__nl') === 'contents__en'</code>
 *  <code>ensureCompleteFieldName('contents_en', 'contents__nl') === 'contents__en'</code>
 */
export function ensureCompleteFieldName(fieldOrVersion: string, defaultFieldName: string) {
	if (isParallelField(fieldOrVersion)) {
		return fieldOrVersion;
	} else {
		// Prefix with the field name
		const parts = getParallelFieldParts(defaultFieldName);
		return getParallelFieldName(parts.prefix, fieldOrVersion);
	}
}


/** Does the specified field name denote a field in a parallel corpus? */
export function isParallelField(fieldName: string) {
	return fieldName.includes(PARALLEL_FIELD_SEPARATOR);
}

/** Are these valid parameters with a pattern that will yield results with hits? */
export function isHitParams(params: BLTypes.BLSearchParameters|null|undefined): params is BLTypes.BLSearchParameters {
	return !! (params && params.patt);
}

/** Span filter ids always start with this */
const SPAN_FILTER_PREFIX = 'span';

/** Separator for span filter id parts */
const SPAN_FILTER_SEPARATOR = ':';

/** ID of span filter, given its element and attribute names. */
export function spanFilterId(elName: string, attributeName: string): string {
	return [SPAN_FILTER_PREFIX, elName, attributeName].join(SPAN_FILTER_SEPARATOR);
}

/** Get element name and attribute name from a span filter id. */
export function elementAndAttributeNameFromFilterId(filterId: string): [string, string] {
	const filterIdParts = filterId.split(SPAN_FILTER_SEPARATOR);
	if (filterIdParts.length !== 3 || filterIdParts[0] !== SPAN_FILTER_PREFIX) {
		throw new Error(`Not a valid span filter ID: ${filterId}`);
	}
	const elName = filterIdParts[1];
	const attrName = filterIdParts[2];
	return [elName, attrName];
}