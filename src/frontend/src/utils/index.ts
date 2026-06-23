// TODO split this file into patternUtils (DONE - JN), groupUtils and generic utils.

import type * as AppTypes from '@/types/apptypes';

import type { Translate } from '@/shared/i18n';
import type { OptGroup, Option } from '@/shared/utils/options';
import { unescapeRegex } from '@/shared/utils/string-utils';

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
