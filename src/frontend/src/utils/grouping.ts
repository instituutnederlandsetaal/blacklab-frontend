import { NormalizedAnnotation, NormalizedMetadataField } from "@/types/apptypes";

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
/** Represents grouping by document metadata */
export type GroupByMetadata = {
	type: 'metadata';
	field: string;
	caseSensitive: boolean;
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
export type GroupBy = GroupByContext|GroupByMetadata|GroupByCustom;

/**
 * Parse a GroupBy string. It should be pre-separated on comma's.
 * https://inl.github.io/BlackLab/server/rest-api/corpus/hits/get.html#criteria-for-sorting-grouping-and-faceting
 */
export function parseGroupBy(groupBy: string[]): GroupBy[] {
	const cast = <T>(x: T): T => x;
	return groupBy.map<GroupBy>(part => {
		const parts = part.split(':');
		const type = parts.length > 0 ? parts[0] : '';

		// some group by options refer to an annotation, optionally preceded by a field name and %.
		const [optFieldName, optAnnotName] = (parts.length > 1 && parts[1].includes('%'))
			? parts[1].split('%')
			: [undefined, parts.length > 1 ? parts[1] : undefined];

		switch (type) {
			// grouping by metadata
			case 'field': return {
				type: 'metadata',
				field: parts[1],
				caseSensitive: parts[2] === 's'
			};
			case 'capture': return cast<GroupByContext>({
				type: 'context',
				fieldName: optFieldName,
				annotation: optAnnotName,
				caseSensitive: parts[2] === 's',
				context: {
					type: 'label',
					// label can be either a capture label (a:"word") or a relation (whether explicitly captured or not, e.g. _ a:--> _).
					// but for the relation, all tokens between source and target are used for the grouping
					// so not what we want. Will need new BlackLab feature to support this.
					// probably want to group on the VALUE of the relation itself, not the tokens.
					label: parts[3],
					relation: parts[4] as 'source'|'target'|'full'|undefined
				}
			})
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
					},
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
				console.warn(`Unknown group by type: ${type}`);
				return {
					type: 'custom',
					value: part
				}
			}
		}
	});
}

/** See https://inl.github.io/BlackLab/server/rest-api/corpus/hits/get.html#criteria-for-sorting-grouping-and-faceting */
export function serializeGroupBy(groupBy: GroupBy): string;
export function serializeGroupBy(groupBy: GroupBy[]): string[]
export function serializeGroupBy(groupBy: GroupBy|GroupBy[]): string|string[] {
	// we use a helper function to make sure we never forget to handle a type.
	// We always call this with whatever we're switching on after handling all cases, so if we forget one, the argument will suddenly
	// be able to exist and we'll get a compile error.
	function never(x: never): never {
		const e = new Error('Unimplemented context info type: ' + JSON.stringify(x, undefined, 2));
		console.error(e, x);
		throw e;
	}

	function serialize(g: GroupBy): string {
		const optTargetField = g.type === 'context' && g.fieldName ? `${g.fieldName}%` : '';
		switch (g.type) {
			case 'metadata': return `field:${g.field}:${g.caseSensitive ? 's' : 'i'}`;
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
	if (!g.type) return false;
	if (g.type === 'metadata' && !g.field) return false;
	if (g.type === 'context') {
		if (!g.annotation) return false;
		if (g.context.type === 'label' && !g.context.label) return false;
		if (g.context.type === 'positional' && !g.context.position) return false;
		if (g.context.type === 'positional' && g.context.whichTokens === 'specific' && (!g.context.start || !g.context.end)) return false;
	}
	return true;
}

export function humanizeGroupBy(i18n: Vue, g: GroupBy, annotations: Record<string, NormalizedAnnotation>, metadata: Record<string, NormalizedMetadataField>): string {
	if (g.type === 'context') {
		if (!g.annotation) return i18n.$t('results.groupBy.specify').toString();
		const field = i18n.$tAnnotDisplayName(annotations[g.annotation]);
		
		if (g.context.type === 'label') return i18n.$t('results.groupBy.summary.labelledWord', {field, label: g.context.label}).toString();
		
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
		if (!g.field) return i18n.$t('results.groupBy.specify').toString();
		return i18n.$t('results.groupBy.summary.metadata', {field: i18n.$tMetaDisplayName(metadata[g.field])}).toString();
	} else {
		// Unknown.
		return g.value;
	}
}