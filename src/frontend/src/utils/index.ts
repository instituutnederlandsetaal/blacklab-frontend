// TODO split this file into patternUtils (DONE - JN), groupUtils and generic utils.

import type * as AppTypes from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';

import type { Translate } from '@/shared/i18n';
import type { OptGroup, Option } from '@/shared/utils/options';
import { unescapeRegex } from '@/shared/utils/string-utils';

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
		while (query.match(/^\([^()]*\)$/)) {
			query = query.substring(1, query.length - 1).trim();
		}
	}
	return query;
}

export function applyWithinClauses(query: string, withinClauses: Record<string, Record<string, any>>) {
	const overlapClauses = Object.entries(withinClauses)
		.map(([elName, attributes]) => {
			const attr = attributes
				? Object.entries(attributes)
						.filter(([k, v]) => !!v)
						.map(([k, v]) => {
							if (typeof v === 'string') {
								// Regex query
								return ` ${k}="${v.replace(/"/g, '\\"')}"`;
							} else if (v.low || v.high) {
								// Range query
								return ` ${k}=in[${v.low || 0},${v.high || 9999}]`;
							} else return '';
						})
						.join('')
				: '';
			return `<${elName}${attr}/>`;
		})
		.join(' overlap ');
	if (query.length > 0 && overlapClauses.length > 0) return `(${query}) within ${overlapClauses}`;
	return query.length > 0 ? query : overlapClauses;
}

type KeysOfType<Base, Condition> = keyof Pick<
	Base,
	{
		[Key in keyof Base]: Base[Key] extends Condition ? Key : never;
	}[keyof Base]
>;

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

// --------------

/** Groups always have at least one member, empty array is returned if no groups would have members. */
export function fieldSubset<T extends { id: string }>(
	ids: string[],
	groups: Array<{ id: string; entries: string[] }>,
	fields: Record<string, T>,
	/** Reduce all groups to a single group with this id. Duplicates are removed. */
	addAllToOneGroup?: string,
): Array<{ id: string; entries: T[] }> {
	let ret: Array<{ id: string; entries: T[] }> = groups
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
 * @param i18n the translation facade to use for i18n
 * @param debug is debug mode enabled? print raw IDS in suffix labels
 * @param showGroupLabels show little group name suffixes at the end of options?
 * @param showFieldFunction a function that returns whether a field should be shown in the list of options. If not provided, all requested fields are shown. For 'customization' (see customization.ts).
 */
export function getMetadataSubset<T extends { id: string; defaultDisplayName?: string }>(
	ids: string[],
	groups: AppTypes.NormalizedMetadataGroup[],
	metadata: Record<string, T>,
	operation: 'Sort' | 'Group',
	i18n: Translate,
	debug = false,
	/* show the <small/> labels at the end of options labels? */
	showGroupLabels = true,
	showFieldFunction?: (id: string) => boolean | null,
): Array<OptGroup & { entries: T[] }> {
	const subset = fieldSubset(ids, groups, metadata);

	// Map a metadata field's id + displayname + group to an option for rendering a groupby or sortby dropdown.
	// This will map the value to be the string required for blacklab to sort/group by the field
	// and the label to be the human-readable display name of the field.
	function mapToOptions(value: string, displayName: string, groupId: string): Option[] {
		const displayIdHtml = debug ? `<small><strong>[id: ${value}]</strong></small>` : '';
		const displayNameHtml = displayName || value;
		const displaySuffixHtml = showGroupLabels && groupId ? `<small class="text-muted">${groupId}</small>` : '';
		const r: Option[] = [];
		const labelI18nKey = operation === 'Sort' ? 'results.table.sortBy' : 'results.table.groupBy';
		r.push({
			value: operation === 'Sort' ? `field:${value}` : value, // groupby prepends field: on its own
			label: i18n.$t(labelI18nKey, { field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}` }).toString(),
		});
		if (operation === 'Sort') {
			r.push({
				value: `-field:${value}`,
				label: i18n.$t('results.table.sortByDescending', { field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}` }).toString(),
			});
		}
		return r;
	}

	const r = subset.map<OptGroup & { entries: T[] }>(group => ({
		options: group.entries.filter(e => showFieldFunction?.(e.id) ?? true).flatMap(e => mapToOptions(e.id, i18n.$tMetaDisplayName(e), i18n.$tMetaGroupName(group.id))),
		entries: group.entries,
		label: i18n.$tMetaGroupName(group.id),
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
	operation: 'Search' | 'Sort',
	i18n: Translate,
	corpusTextDirection: 'rtl' | 'ltr' = 'ltr',
	debug = false,
	showGroupLabels = false,
): Array<OptGroup & { entries: AppTypes.NormalizedAnnotation[] }> {
	function findAnnotatedFieldId(groupId: string) {
		return groups.find(g => g.id === groupId)?.annotatedFieldId || groups[0].annotatedFieldId;
	}

	const subset = fieldSubset(ids, groups, annotations, operation !== 'Search' ? 'Other' : undefined);
	if (operation === 'Search') {
		return subset.map(group => {
			const annotationGroupMock: AppTypes.NormalizedAnnotationGroup = {
				annotatedFieldId: findAnnotatedFieldId(group.id),
				entries: [],
				id: group.id,
				isRemainderGroup: false,
			};
			const groupNameLocalized = i18n.$tAnnotGroupName(annotationGroupMock);

			return {
				entries: group.entries,
				options: group.entries.map(a => ({
					value: a.id,
					label: i18n.$tAnnotDisplayName(a) + (showGroupLabels ? ` <small class="text-muted">${groupNameLocalized}</small>` : '') + (debug ? ` <small><strong>[id: ${a.id}]</strong></small>` : ''),
					title: i18n.$tAnnotDescription(a),
				})),
				// hack, when using a default group we need to come up with an annotated field
				// So just use the first annotated field we come across.
				label: i18n.$tAnnotGroupName({ id: group.id, annotatedFieldId: findAnnotatedFieldId(group.id), entries: [], isRemainderGroup: false }),
			};
		});
	} else {
		// Generate options for sorting by annotation.
		// I.e. 6 options per annotation. 3 for each position: before, hit, after
		// and 2 per postion: ascending and descending.
		return [
			['hit:', 'Hit', ''],
			['before:', 'Before hit', 'before'],
			['after:', 'After hit', 'after'],
		].map<OptGroup & { entries: AppTypes.NormalizedAnnotation[] }>(([prefix, groupname, suffix]) => ({
			label: groupname,
			entries: subset[0].entries,
			options: ids.flatMap<Option>(id => {
				// in debug mode - show IDs
				const displayIdHtml = debug ? `<small><strong>[id: ${id}]</strong></small>` : '';
				const displayNameHtml = i18n.$tAnnotDisplayName(annotations[id]);
				const displaySuffixHtml = showGroupLabels && suffix ? `<small class="text-muted">${suffix}</small>` : '';

				return [
					{
						label: i18n.$t('results.table.sortBy', { field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}` }).toString(),
						value: `${prefix}${id}`,
					},
					{
						label: i18n.$t('results.table.sortByDescending', { field: `${displayNameHtml} ${displayIdHtml} ${displaySuffixHtml}` }).toString(),
						value: `-${prefix}${id}`,
					},
				];
			}),
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

export const uiTypeSupport: { [key: string]: { [key: string]: Array<AppTypes.NormalizedAnnotation['uiType']> } } = {
	search: {
		simple: ['combobox', 'select', 'lexicon'],
		extended: ['combobox', 'select', 'pos'],
	},
	explore: {
		ngram: ['combobox', 'select'],
	},
};

export function getCorrectUiType<T extends AppTypes.NormalizedAnnotation['uiType']>(allowed: T[], actual: T): T {
	return allowed.includes(actual) ? actual : ('text' as any);
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
		version: parts[1],
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
export function isHitParams(params: BLTypes.BLSearchParameters | null | undefined): params is BLTypes.BLSearchParameters {
	return !!(params && params.patt);
}

/**
 * We need to generate filter IDs for spans, which should never collide with filters for builtin metadata fields of the corpus
 * (which always have a filter with that same ID)
 * To that end, we always combine the spans ("inlineTags") with a fixed prefix,
 * This also happens during e.g. query parsing (for blacklab patterns like `<speech person="Smith">`)
 * Will be parsed (roughly) into a filter mapping of { "span:speech:person": "Smith" }
 */
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
