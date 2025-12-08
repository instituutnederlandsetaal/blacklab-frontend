import { NormalizedAnnotation, NormalizedMetadataField } from "@/types/apptypes";
import { BLSearchResult } from '@/types/blacklabtypes';
import { spanFilterId } from '@/utils';
import * as FilterModule from '@/store/search/form/filters';

/** Group by some tokens at a fixed position in the hit. */
export type ContextPositional = {
	type: 'positional';
	/** B === 'before', H === 'from start of hit', A === 'after hit', E === 'from end of hit (reverse)' */
	position: 'B'|'H'|'A'|'E';

	whichTokens: 'specific'|'first'|'all',
	/** Unused when whichTokens !== 'specific', but for ease of use we make this always exist. */
	start: number,
	/** Unused when whichTokens !== 'specific', but for ease of use we make this always exist. */
	end: number,
}
/** Group by a labelled part of the hit. E.G. a:[] or _ a:--> _ */
export type ContextLabel = {
	type: 'label';
	label: string;
	relation?: 'source'|'target'|'full'|undefined;
}

/** Represents grouping by one or more tokens in the hit */
export type GroupByContext<T extends ContextPositional|ContextLabel = ContextPositional|ContextLabel> = {
	type: 'context',
	fieldName?: string,
	annotation: string|undefined,
	caseSensitive: boolean,

	context: T;
}

/** Document-level metadata */
export type MetadataDocument = {
	type: 'document';
	field: string;
	/** Sort/group by the decade of the year given in specified metadata field (rounds the value of the field down to the nearest multiple of 10, so 1976 becomes 1970). */
	decade?: boolean;
}
/** Span-level metadata */
export type MetadataSpanAttribute = {
	type: 'span-attribute';
	spanName: string;
	attributeName: string;
}

/** Represents grouping by metadata (document-level or span-level) */
export type GroupByMetadata<T extends MetadataDocument|MetadataSpanAttribute = MetadataDocument|MetadataSpanAttribute> = {
	type: 'metadata';
	caseSensitive: boolean;

	metadata: T;
}

export type SortByGroupProperty = {
	type: 'group-property';
	property: 'identity'|'size';
}

/**
 * Represents grouping by something we don't support.
 * We just stick the raw string in the value field.
 * Should only occur from deserialization handcrafted urls, or when there are bugs in the parse code.
 */
export type GroupByCustom = {
	type: 'custom';
	value: string;
}

type SortingOrGroupingCriterium = GroupByContext|GroupByMetadata|GroupByCustom;
export type GroupBy = SortingOrGroupingCriterium;
export type SortBy = (SortingOrGroupingCriterium|SortByGroupProperty) & {inverted: boolean};
function isSortBy(s: GroupBy|SortBy): s is SortBy { return 'inverted' in s && typeof s.inverted === 'boolean'; }

/** 
* We use a helper function to make sure we never forget to handle a type.
* We always call this with whatever we're switching on after handling all cases, so if we forget one, the argument will suddenly
* be able to exist and we'll get a compile error.
*/
function never(x: never): never {
	const e = new Error('Unimplemented context info type: ' + JSON.stringify(x, undefined, 2));
	console.error(e, x);
	throw e;
}

function determineRelationPartField(results: BLSearchResult|undefined, label: string, relationPart: string|undefined, overriddenFieldName: string|undefined) {
	const defaultFieldName = overriddenFieldName ?? results?.summary.pattern?.fieldName;
	const matchInfoDef = results?.summary.pattern?.matchInfos?.[label];
	if (matchInfoDef) {
		// Make sure we return the correct field if we're referencing a crossfield relation target
		if (relationPart === 'target')
			return matchInfoDef.targetField ?? defaultFieldName;
		else
			return matchInfoDef.fieldName ?? defaultFieldName;
	}
	return defaultFieldName;
};

/**
 * Parse a GroupBy or SortBy string. Without the leading '-' for sorting.
 * Shared between grouping and sorting as they largely use the same criterium syntax.
 * Dedicated grouping/sorting options are handled in the parseGroupBy/parseSortBy functions internally.
 * 
 * https://blacklab.ivdnt.org/server/rest-api/corpus/hits/get.html#criteria-for-sorting-grouping-and-faceting
 */
function parseCriterium(criterium: string, results?: BLSearchResult): SortingOrGroupingCriterium {
	const cast = <T>(x: T): T => x;
	
	const parts = criterium.split(':');
	const type = parts.length > 0 ? parts[0] : '';
	
	// some group by options refer to an annotation, optionally preceded by a field name and %.
	const [optFieldName, optAnnotName] = (parts.length > 1 && parts[1].includes('%'))
		? parts[1].split('%')
		: [undefined, parts.length > 1 ? parts[1] : undefined];

	switch (type) {
		// grouping by metadata
		case 'field': 
		case 'decade': return {
			type: 'metadata',
			caseSensitive: parts[2] === 's',
			metadata: {
				type: 'document',
				field: parts[1],
				decade: type === 'decade'
			},
		};
		case 'capture':
			const [_, __, sensitivity, label, relationPart] = parts;
			const actualFieldName = determineRelationPartField(results, label, relationPart, optFieldName)
			return cast<GroupByContext>({
				type: 'context',
				fieldName: actualFieldName,
				annotation: optAnnotName,
				caseSensitive: sensitivity === 's',
				context: {
					type: 'label',
					// label can be either a capture label (a:"word") or a relation (whether explicitly captured or not, e.g. _ a:--> _).
					label,
					relation: relationPart as 'source'|'target'|'full'|undefined
				},
			});
		case 'span-attribute': {
			const [__, tagName, attributeName, sensitivity] = parts;
			// @@@ TODO: how do we pass fieldName with span-attribute?
			//           (or is that determined automatically by BL based on capture name..?)
			//const actualFieldName = determineRelationPartField(results, tagName, 'source', optFieldName);
			return {
				type: 'metadata',
				caseSensitive: sensitivity === 's', // NOTE: ignored, determined by how spans were indexed (the new default is case-insensitive)
				metadata: {
					type: 'span-attribute',
					spanName: tagName,
					attributeName: attributeName  ///@@@@@
				}
			};
		}
		case 'hit':
			return cast<GroupByContext>({
				type: 'context',
				fieldName: optFieldName,
				annotation: optAnnotName,
				caseSensitive: parts[2] === 's',
				context: {
					type: 'positional',
					position: 'H',
					whichTokens: 'all',
					start: 1, end: 1
				}
			})
		// grouping by words in/around the hit
		case 'left':
		case 'before':
		case 'right':
		case 'after': {
			const [_, annot, caseSensitive, howManyWords] = parts;
			const start = 1; // these always start at 1. The number is just "how many words before or after"
			const end = Number(howManyWords) ;
			const fullContext = isNaN(end);

			return cast<GroupByContext>({
				type: 'context',
				fieldName: optFieldName,
				annotation: optAnnotName,
				caseSensitive: caseSensitive === 's',
				context: {
					type: 'positional',
					position: (type === 'left' || type === 'before') ? 'B' : 'A',

					whichTokens: fullContext ? 'all' : 'specific',
					start,
					end,
				}
			});
		}
		case 'wordleft':
		case 'wordright': return cast<GroupByContext>({
			type: 'context',
			fieldName: optFieldName,
			annotation: optAnnotName,
			caseSensitive: parts[2] === 's',
			context: {
				type: 'positional',
				position: type === 'wordleft' ? 'B' : 'A',
				whichTokens: 'first',
				start: 1,
				end: 1
			}
		});

		// grouping by specific context (e.g. at (a) specific offset(s) within/before/after the hit)
		// these are a bit more complex, and we don't support all options in the UI.
		// when we encounter one we can't parse fully, we'll just returns the parts we can parse.
		case 'context': {
			const [_, annot, caseSensitive, spec, targetField] = parts;
			const parsedSpec = spec.match(/(L|R|H|E|B|A)(\d*)-?(\d*)/);
			if (parsedSpec) { // this can contain more, like ; and a second(+) set of positions. We'll ignore that for now.
				let [_, position, startMaybe, endMaybe] = parsedSpec;
				// right/left -> before/after. Since BL 4
				if (position === 'R') position = 'A';
				if (position === 'L') position = 'B';

				const fullContext = !startMaybe && !endMaybe;
				let start = Number(startMaybe) || 1;
				let end = Number(endMaybe) || 5;

				return cast<GroupByContext>({
					type: 'context',
					fieldName: optFieldName,
					annotation: optAnnotName,
					caseSensitive: caseSensitive === 's',
					context: {
						type: 'positional',
						position: position as any,

						whichTokens: fullContext ? 'all' : 'specific',
						start,
						end,
					}
				});
			} // else fallthrough default, which returns the whole part as a string.
		}
		default: {
			console.warn(`Unknown group by/sort by criterium type: ${type} (full: ${criterium})`);
			return {
				type: 'custom',
				value: criterium
			}
		}
	}
}

export function parseSortBy(sortBy: string, results?: BLSearchResult): SortBy {
	const inverted = sortBy.startsWith('-');
	if (inverted) sortBy = sortBy.substring(1);
	
	if (sortBy === 'identity' || sortBy === 'size') { 
		return {
			type : 'group-property',
			property: sortBy,
			inverted
		}
	}

	return {
		...parseGroupBy([sortBy], results)[0],
		inverted
	}
}

/**
 * Parse a GroupBy string. It should be pre-separated on comma's.
 * https://blacklab.ivdnt.org/server/rest-api/corpus/hits/get.html#criteria-for-sorting-grouping-and-faceting
 */
export function parseGroupBy(groupBy: string[], results?: BLSearchResult): GroupBy[] {
	return groupBy.map(part => parseCriterium(part, results));
}

/** See https://blacklab.ivdnt.org/server/rest-api/corpus/hits/get.html#criteria-for-sorting-grouping-and-faceting */
export function serializeSortByOrGroupBy(groupBy: GroupBy|SortBy): string;
export function serializeSortByOrGroupBy(groupBy: GroupBy[]|SortBy[]): string[]
export function serializeSortByOrGroupBy(groupBy: GroupBy|SortBy|GroupBy[]|SortBy[]): string|string[] {

	function serialize(g: GroupBy|SortBy): string {
		const optTargetField = g.type === 'context' && g.fieldName ? `${g.fieldName}%` : '';
		switch (g.type) {
			case 'group-property': {
				return g.property;
			}
			case 'metadata': {
				const meta = g.metadata;
				if (meta.type === 'document') {
					return `field:${meta.field}:${g.caseSensitive ? 's' : 'i'}`;
				} else if (meta.type === 'span-attribute') {
					return `span-attribute:${meta.spanName}:${meta.attributeName}:${g.caseSensitive ? 's' : 'i'}`;
				}
				const e = new Error('Unimplemented metadata group type: ' + JSON.stringify(g, undefined, 2))
				console.error(e, g);
				throw e;
			}
			case 'context': {
				const ctx = g.context;
				if (ctx.type === 'label') {
					return `capture:${g.annotation}:${g.caseSensitive ? 's' : 'i'}:${ctx.label}${ctx.relation ? ':' + ctx.relation : ''}`;
				} else if (ctx.type === 'positional') {
					/*
						Examples:
						{ type: 'positional', position: 'B', whichTokens: 'specific', start: 1, end: 2 } ==> 'context:capture:s:B1-2'
						{ type: 'positional', position: 'H', whichTokens: 'all' } ==> 'context:capture:s:H'
						{ type: 'positional', position: 'A', whichTokens: 'first' } ==> 'context:capture:s:A1-1'
					*/

					const {position, whichTokens, start, end} = ctx;

					let spec = position; // B, H, A, E
					if (whichTokens === 'all') {}
					else if (whichTokens === 'first') spec += '1-1';
					else if (whichTokens === 'specific') spec += `${start}${end ? '-' + end : ''}`;
					else {
						never(whichTokens && g);
					}

					return `context:${optTargetField}${g.annotation}:${g.caseSensitive ? 's' : 'i'}:${spec}`;
				} else {
					never(ctx && g);
				}
			}
			case 'custom': return g.value;
			default: never(g);
		}
	};

	return Array.isArray(groupBy) ? groupBy.map(serialize) : serialize(groupBy);
}

export function isValidGroupBy(g: GroupBy): boolean {
	if (!g.type)
		return false;
	if (g.type === 'metadata') {
		if (g.metadata.type === 'document')
			return !!g.metadata.field;
		if (g.metadata.type === 'span-attribute')
			return !!(g.metadata.spanName || g.metadata.attributeName);
	}
	if (g.type === 'context') {
		if (!g.annotation) return false;
		if (g.context.type === 'label' && !g.context.label) return false;
		if (g.context.type === 'positional' && !g.context.position) return false;
		if (g.context.type === 'positional' && g.context.whichTokens === 'specific' && (!g.context.start || !g.context.end)) return false;
	}
	return true;
}

// Take care that groups passed in here don't conform to the corpus
// As we don't validate the groups upfront while decoding the url.
export function humanizeGroupByOrSortBy(i18n: Vue, g: GroupBy|SortBy, annotations: Record<string, NormalizedAnnotation>, metadata: Record<string, NormalizedMetadataField>): string {
	function baseHumanize(g: GroupBy|SortBy): string {
		if (g.type === 'context') {
			if (!g.annotation)
				return i18n.$t('results.groupBy.specify').toString();
			const field = i18n.$tAnnotDisplayName(g.annotation in annotations ? annotations[g.annotation] : {id: g.annotation, defaultDisplayName: g.annotation});

			if (g.context.type === 'label')
				return i18n.$t('results.groupBy.summary.labelledWord', {field, label: g.context.label}).toString();

			let positionDisplay: string;
			switch (g.context.position) {
				case 'A': positionDisplay = i18n.$t('results.groupBy.summary.position.after').toString(); break;
				case 'B': positionDisplay = i18n.$t('results.groupBy.summary.position.before').toString(); break;
				case 'H': positionDisplay = i18n.$t('results.groupBy.summary.position.hit').toString(); break;
				case 'E': positionDisplay = i18n.$t('results.groupBy.summary.position.end').toString(); break;
				default: positionDisplay = g.context.position;
			}

			switch (g.context.whichTokens) {
				case 'all': return i18n.$t('results.groupBy.summary.allWords', {field: field, position: positionDisplay}).toString();
				case 'first': return i18n.$t('results.groupBy.summary.firstWord', {field: field, position: positionDisplay}).toString();
				case 'specific': return i18n.$t('results.groupBy.summary.indexedWord', {
					field: field,
					position: positionDisplay,
					index: g.context.start !== g.context.end ? g.context.position === 'E' ?  `${g.context.end}-${g.context.start}` : `${g.context.start}-${g.context.end}` : g.context.start
				}).toString();
				default: return i18n.$t('results.groupBy.specify').toString();
			}
		} else if (g.type === 'metadata') {
			const meta = g.metadata;
			if (meta.type === 'span-attribute') {
				// Span-level metadata
				let span = meta.spanName;
				const m = span.match(/^with-spans\[([^\]]+)\]$/);
				if (m) {
					// with-spans[verse] -> verse
					span = m[1];
				}
				console.log(m, meta.spanName, span, meta.attributeName);
				const filterId = spanFilterId(span, meta.attributeName);
				const filter = FilterModule.getState().filters[filterId];
				return filter ?
					i18n.$tMetaDisplayName(filter).toString() :
					i18n.$tSpanAttributeDisplay(span, meta.attributeName).toString();
			}
			// Document-level metadata
			return meta.field ?
				i18n.$t('results.groupBy.summary.metadata', {field: i18n.$tMetaDisplayName(metadata[meta.field]) ?? {id: meta.field}}).toString() :
				i18n.$t('results.groupBy.specify').toString();
		} else if (g.type === 'group-property') {
			if (g.property === 'identity')
				return i18n.$t('results.table.sort_groupName').toString();
			else if (g.property === 'size')
				return i18n.$t('results.table.sort_groupSize').toString();
			else { // unknown, return as-is
				never(g.property);
				// @ts-expect-error g.property is never
				return g.property; 
			} 
		} else if (g.type === 'custom') {
			// Unknown.
			return g.value;
		} else {
			never(g);
			return '';
		}
	}

	const humanized = baseHumanize(g);
	if (isSortBy(g)) return humanized + (g.inverted ? ' ↑' : ' ↓');
	return humanized;
}

export function humanizeSerializedGroupBy<T extends string|string[]>(
	i18n: Vue,
	g: T,
	annotations: Record<string, NormalizedAnnotation>,
	metadata: Record<string, NormalizedMetadataField>
): T {
	const r = [g].flat().map(g => humanizeGroupByOrSortBy(i18n, parseGroupBy([g])[0], annotations, metadata));
	// @ts-ignore
	return Array.isArray(g) ? r : r[0];
}
