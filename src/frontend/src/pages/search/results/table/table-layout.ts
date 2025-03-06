import { BLDoc, BLDocFields, BLDocGroupResult, BLDocGroupResults, BLDocInfo, BLDocResults, BLHit, BLHitGroupResult, BLHitGroupResults, BLHitInOtherField, BLHitResults, BLHitSnippet, BLHitSnippetPart, BLMatchInfo, BLMatchInfoList, BLMatchInfoRelation, BLMatchInfoSpan, BLSearchParameters, BLSearchResult, BLSearchSummary, BLSearchSummaryTotalsHits, hitHasParallelInfo, isDocGroups, isDocResults, isGroups, isHitGroups, isHitResults } from '@/types/blacklabtypes';
import { HitContext, HitToken, NormalizedAnnotatedField, NormalizedAnnotatedFieldParallel, NormalizedAnnotation, NormalizedMetadataField, TokenHighlight } from '@/types/apptypes';
import { getDocumentUrl } from '@/utils';
import { GlossFieldDescription } from '@/store/search/form/glossStore';

import * as Highlights from './hit-highlighting';

import { KeysOfType } from '@/types/helpers';


/**
 * The columns can display various computed data, such as relative group size, or relative frequency.
 * To keep the displaying manageable we use shortcodes for those, this is a definition list.
 * also for developer documentation :)
 */
export const definitions = [
	['c',   '[corpus]',            'The entire corpus'],
	['sc',  '[subcorpus]',         'A set of documents within c. Defined by a specific set of metadata.'],
	['gsc', '[grouped subcorpus]', 'A set of documents within sc. Creating by matching a set of metadata against documents in sc. If not grouping by metadata, gsc=sc'],
	['r',   '[results]',           'A set of documents within sc. Created by matching a (optional) cql pattern against documents in sc. If no cql is used, r=sc'],
	['gr',  '[grouped results]',   'A set of documents within r. Created by matching a set of metadata against documents in r.'],

	['*.d', '[documents]',         'Number of documents in a collection'],
	['*.t', '[tokens]',            'Number of tokens in a collections'],
	['*.h', '[documents]',         'Number of hits in a collection'],
];

/**
 * Represents the data structure for a group row in the search results table.
 * The BlackLab api response for groups has data in several different places.
 * We unpack and simplify it a little so that every entry has the same data available. Names are according to the definitions above
 */
export interface GroupRowData {
	/** Type of the row, which is always 'group'. */
	type: 'group';
	/** ID of the group in BlackLab. */
	id: string;
	/** Size of the group. */
	size: number;
	/** Display name of the group. */
	displayname: string;
	/** Total number of documents in the total result set. */
	'r.d': number;
	/** Total number of tokens across all matched documents. */
	'r.t'?: number;
	/** Total number of hits. Unavailable for queries without CQL pattern. */
	'r.h'?: number;
	/** Number of documents in the group. */
	'gr.d': number;
	/** Number of tokens in the group. FIXME: Remove optional flag when Jan implements. */
	'gr.t'?: number;
	/** Number of hits in the group. Unavailable for queries without CQL pattern. */
	'gr.h'?: number;
	/** Group within total search space. Might be unknown (in rare cases, 0 is returned for groups where the metadata value is unknown). */
	'gsc.d'?: number;
	/** Group within total search space. Might be unknown (in rare cases, 0 is returned for groups where the metadata value is unknown). */
	'gsc.t'?: number;
	/** Total search space. */
	'sc.d': number;
	/** Total search space. */
	'sc.t': number;
	/** Relative group size (documents) [gr.d/r.d]. Adds to 1 across all groups. */
	'relative group size [gr.d/r.d]': number;
	/** Relative group size (tokens) [gr.t/r.t]. Adds to 1 across all groups. FIXME: Remove optional flag when Jan implements. */
	'relative group size [gr.t/r.t]'?: number;
	/** Relative group size (hits) [gr.h/r.h]. Adds to 1 across all groups. Optional, only when CQL pattern is available. */
	'relative group size [gr.h/r.h]'?: number;
	/** Relative frequency (documents) [gr.d/gsc.d]. Optional because subcorpus might not be calculable. */
	'relative frequency (docs) [gr.d/gsc.d]'?: number;
	/** Relative frequency (tokens) [gr.t/gsc.t]. Optional because subcorpus might not be calculable. */
	'relative frequency (tokens) [gr.t/gsc.t]'?: number;
	/** Relative frequency (hits) [gr.h/gsc.t]. Optional because subcorpus might not be calculable and hits are optional. */
	'relative frequency (hits) [gr.h/gsc.t]'?: number;
	/** Relative frequency (documents) [gr.d/sc.d]. Optional because subcorpus is unknown for metadata grouped requests. Wait for Jan. */
	'relative frequency (docs) [gr.d/sc.d]'?: number;
	/** Relative frequency (tokens) [gr.t/sc.t]. Optional because subcorpus is unknown for metadata grouped requests. Wait for Jan. */
	'relative frequency (tokens) [gr.t/sc.t]'?: number;
	/** Average document length [gr.t/gr.d]. */
	'average document length [gr.t/gr.d]'?: number;
}

/** What properties are available to display in the columns */
type Column = keyof GroupRowData;
/**
 * A "table" layout is just an array of columns.
 * A column in our case is a cell holding a number, or a horizontal bar (the table represents a sideways bar chart)
 * The subarray represents a bar, and a string ("column") represents a cell holding a number (like rowData[cell.key])
 */
type TableDef = Array<Column|[Column, Column]>;

/**
 * These are the table layouts we can show for grouped data.
 * There are several ways of displaying the data, and the user can pick which one they want.
 *
 * It is structured as follows:
 * Based on what the user has searched for, there are several ways of displaying the data
 * - At the top is the distinction of what we're grouping/displaying: hits or docs
 * - Below that is the distinction of what is being grouped on: document metadata, or a hit property (such as 'lemma' or 'pos')
 * - Then below THAT, is the display mode chose by the user. These are the same data, just different sets of columns.
 *     Usually one wide table containing all relevant properties of the groups
 *     Then the rest are the same columns but in a wider view using a horizontal bar to illustrate the magnitude of the group,
 *     instead of just a cell with a fractional number.
 */
const displayModes: Record<'hits'|'docs', Record<'metadata'|'annotation', Record<string, TableDef>>> = {
	hits: {
		metadata: {
			'table': [
				'displayname',
				'gr.d',
				'gr.h',
				'gsc.d',
				'gsc.t',
				'relative frequency (docs) [gr.d/gsc.d]',
				'relative frequency (hits) [gr.h/gsc.t]',
			],

			'docs': [
				'displayname',
				['relative group size [gr.d/r.d]', 'gr.d'],
				'relative group size [gr.d/r.d]',
			],

			'hits': [
				'displayname',
				['relative group size [gr.h/r.h]', 'gr.h'],
				'relative group size [gr.h/r.h]',
			],

			'relative docs': [
				'displayname',
				['relative frequency (docs) [gr.d/gsc.d]', 'gr.d'],
				'relative frequency (docs) [gr.d/gsc.d]'
			],

			'relative hits': [
				'displayname',
				['relative frequency (hits) [gr.h/gsc.t]', 'gr.h'],
				'relative frequency (hits) [gr.h/gsc.t]'
			],
		},
		annotation: {
			'table': [
				'displayname',
				'gr.h',
				'relative frequency (hits) [gr.h/gsc.t]'
			],
			'hits': [
				'displayname',
				['relative frequency (hits) [gr.h/gsc.t]', 'gr.h'],
				'relative frequency (hits) [gr.h/gsc.t]',
			],
		},
	},
	docs: {
		annotation: {'table': []}, // docs can't be grouped by annotaiton, we have this so we don't get key warnings from typescript.
		metadata: {
			'table': [
				'displayname',
				'gr.d',
				'gr.t',
				'relative frequency (docs) [gr.d/gsc.d]',
				'relative frequency (tokens) [gr.t/gsc.t]',
				'average document length [gr.t/gr.d]',
			],
			'docs': [
				'displayname',
				['relative group size [gr.d/r.d]', 'gr.d'],
				'relative group size [gr.d/r.d]'
			],
			'tokens': [
				'displayname',
				['relative frequency (tokens) [gr.t/gsc.t]', 'gr.t'],
				'relative frequency (tokens) [gr.t/gsc.t]'
			],
		}
	}
};

/**
 * For every possible column (1 per key in the RowData type) a column header is defined.
 * It holds the display name, possible tooltip, and optionally what to sort on should the user click the header
 * (e.g. the column header for the "size" property sorts the groups based on size when clicked by the user - analogous to the Hits and Docs tables)
 *
 * So just a mapping for every internal column id to a display name, tooltip and sort property.
 */
const tableHeaders: {
	[K in ('hits'|'docs'|'default')]: {
		[ColumnId in keyof GroupRowData]?: {
			label?: string;
			title?: string;
			/** annotation, meta field or other property to sort on should this header be clicked by the user */
			sortProp?: string;
		}
	}
} = {
	default: {
		'displayname': {
			label: 'Group',
			title: 'Group name',
			sortProp: 'identity'
		},
		'average document length [gr.t/gr.d]': {
			label: 'Average document length',
			title: '(gr.t/gr.d)'
		},
		'gsc.d': {
			label: '#all docs in current group',
			title: '(gsc.d) - This includes documents without hits'
		},
		'gr.t': {
			label: '#tokens in group',
			title: '(gr.t) - Combined length of all documents with hits in this group',
		},
		'gr.h': {
			label: '#hits in group',
			title: '(gr.h)'
		},
		'relative frequency (docs) [gr.d/gsc.d]': {
			label: 'Relative frequency (docs)',
			title: '(gr.d/gsc.d) - Note that gsc.d = sc.d when not grouped by metadata'
		},
		'relative frequency (hits) [gr.h/gsc.t]': {
			label: 'Relative frequency (hits)',
			title: '(gr.h/gsc.t) - Note that gsc.t = sc.t when not grouped by metadata'
		},
		'relative frequency (tokens) [gr.t/gsc.t]': {
			label: 'Relative frequency (tokens)',
			title: '(gr.t/gsc.t) - Note that gsc.t = sc.t when not grouped by metadata'
		}
	},
	hits: {
		'gr.d': {
			label: '#docs with hits in current group',
			title: '(gr.d)',
		},
		'gr.h': {
			sortProp: 'size'
		},
		'gsc.t': {
			label: '#all tokens in current group',
			title: '(gr.t)',
		},

		'relative group size [gr.d/r.d]': {
			label: 'Relative group size (docs)',
			title: '(gr.d/r.d) - Number of found documents in this group relative to total number of found documents',
		},
		'relative group size [gr.h/r.h]': {
			label: 'Relative group size (hits)',
			title: '(gr.h/r.h) - Number of hits in this group relative to total number hits',
		},
	},
	docs: {
		'gr.d': {
			label: '#docs in group',
			title: '(gr.d)',
			sortProp: 'size'
		},
		'relative group size [gr.d/r.d]': {
			label: 'Relative frequency (docs)',
			title: '(gr.d/r.d)',
		},
	},
};
// Helpers to compute the largest number in the currently displayed result set.
// E.G. largest occurance of the RowData['gr.d'] property.
// This is required to scale the bars in the horizontal barchart view. The largest occurance of a value there has 100% width.
// NOTE: sometimes we know the absolute maximum across all groups (such as the size), because BlackLab tells us,
// but sometimes we only have the maximum value in the currently displayed page (such as for properties we compute locally, such as relative sizes).
// Fixing this would be a substantial amount of extra work for BlackLab.
export type LocalMaxima = {  [P in keyof GroupRowData]-?: number extends GroupRowData[P] ? number : never; };
export class MaxCounter<T, K extends (T extends string ? T : KeysOfType<T, number>) = T extends string ? T : KeysOfType<T, number>> {
	public values: Record<K, number> = {} as any;

	public add(key: K, v?: number) {
		if (typeof v === 'number')
			this.values[key] = Math.max(this.values[key] || 0, v);
	}
}

/**
 * Flatten a set of arrays into an array of sets.
 * { a: [], b: [] } ==> [ { a: '', b: '' }, { a: '', b: '' }]
 *
 * @param part The part of the hit on which to do this.
 * @param punctuationSettings BlackLab sends punctuation BEFORE the token, with a trailing value at the end
 *                            This doesn't align nicely with how we want to render it, so we have to scoot over the punctuation
 *                            Generally, we remove punctation at the very start and end, and move the punctation at the end of the hit over to the after context.
 */
function flatten(part: BLHitSnippetPart|undefined, punctuationSettings: {punctAfterLastWord?: string, firstPunct?: boolean}): HitToken[] {
	if (!part) return [];
	/** The result array */
	const r: HitToken[] = [];
	const length = part.punct.length;
	for (let i = 0; i < part.punct.length; i++) {
		// punctuation is the punctuation/whitespace BEFORE the current word. There is always one more punctuation than there are words in a document (fencepost problem).
		const punct = (i === length - 1 ? punctuationSettings.punctAfterLastWord : part.punct[i+1]) || '';
		const token: HitToken = {punct, annotations: {}};
		if (i === 0 && punctuationSettings.firstPunct) token.punctBefore = part.punct[i];
		r.push(token);
	}
	for (const annotationId in part) {
		if (annotationId !== 'punct') // we already handled this.
		for (let i = 0; i < part[annotationId].length; i++) {
			r[i].annotations[annotationId] = part[annotationId][i];
		}
	}
	return r;
}

/**
 * Split a hit into before, match, and after parts, with capture and relation info added to the tokens.
 * The punct is to be shown after the word.
 *
 * @param summary - the search summary, containing all matchInfos, so we can be sure to have the same color for every hit.
 * @param hit - the hit, or most of the hit in case of doc results (which contain less info than hits)
 * @param colors - which colors to use for highlighting. This is usually the result of getHighlightColors. If omitted, no highlighting will be done.
 *
 * @returns the hit split into before, match, and after parts, with capture and relation info added to the tokens. The punct is to be shown after the word.
 */
export function snippetParts(hit: BLHit|BLHitSnippet, colors?: Record<string, TokenHighlight>): HitContext {
	// NOTE: the original BLS API was designed before RTL support and uses left/right to mean before/after.
	//       the new BLS API correctly uses before/after, which makes sense for both LTR and RTL languages.
	const before = flatten(hit.left, {punctAfterLastWord: hit.match.punct[0]});
	const match = flatten(hit.match, {});
	const after = flatten(hit.right, {firstPunct: true});

	// Only extract captures if have the necessary info to do so.
	if (!('start' in hit) || !hit.matchInfos || !colors)
		return { before, match, after };

	const highlights = Highlights.getHighlightSections(hit.matchInfos);
	if (highlights.length) {
		before.forEach((token, i) => token.captureAndRelation = Highlights.findHighlightsByTokenIndex(highlights, i + hit.start - before.length, colors));
		match.forEach((token, i) => token.captureAndRelation = Highlights.findHighlightsByTokenIndex(highlights, i + hit.start, colors));
		after.forEach((token, i) => token.captureAndRelation = Highlights.findHighlightsByTokenIndex(highlights, i + hit.end, colors));
	}
	return { before, match, after };
}

// ===================

export type DisplaySettingsForRendering = {
	/** Annotation shown in the before/hit/after columns and expanded concordance */
	mainAnnotation: NormalizedAnnotation;
	/** Additional annotation columns to show (besides before/hit/after) */
	otherAnnotations: NormalizedAnnotation[];
	/** Annotations shown in the expanded concordance. May be empty. */
	detailedAnnotations: NormalizedAnnotation[];
	/** What properties/annotations to show for tokens in the deptree, e.g. lemma, pos, etc. */
	depTreeAnnotations: Record<'lemma'|'upos'|'xpos'|'feats', NormalizedAnnotation|null>,
	/** What annotations should be offered up for sorting in the context (before,hit,after) column headers? */
	sortableAnnotations: NormalizedAnnotation[];

	/** Optional. Additional metadata columns to show. Normally nothing, but could show document id or something */
	metadata: NormalizedMetadataField[];

	/** Field to show for the main hit. This should already have the prefix. */
	sourceField: NormalizedAnnotatedField;
	/** Fields to show the secondary (parallel) hits. Can be empty for non-parallel corpora. These should already have the prefix. */
	targetFields: NormalizedAnnotatedFieldParallel[];

	/** For the 'empty' group. I.e. when grouping on for example document date, the name for the group containing docs without a date. */
	defaultGroupName: string;

	/** Required to compute document title/summary. */
	specialFields: BLDocFields;
	/** Document title/summary can be customized, so a callback is required. */
	getSummary: (doc: BLDocInfo, specialFields: BLDocFields) => string;

	/** Main text direction of the corpus */
	dir: 'ltr'|'rtl';
	/** Display results as html? */
	html: boolean;

	i18n: Vue;

	groupDisplayMode: 'table'|'docs'|'hits'|'relative docs'|'relative hits'|'tokens';
}

export type DisplaySettingsCommon = Pick<DisplaySettingsForRendering, 'dir'|'i18n'|'specialFields'>
export type DisplaySettingsForRows = DisplaySettingsCommon&Pick<DisplaySettingsForRendering, 'sourceField'|'targetFields'|'getSummary'>
export type DisplaySettingsForColumns = DisplaySettingsCommon&Pick<DisplaySettingsForRendering, 'mainAnnotation'|'metadata'|'otherAnnotations'|'sortableAnnotations'|'groupDisplayMode'>

/** Helper type, data for which we're computing a hitrow or docrow. */
type Result<HitType extends BLHit|BLHitSnippet|BLHitInOtherField|undefined = BLHit|BLHitSnippet|BLHitInOtherField|undefined> = {
	doc: BLDoc;
	hit: HitType;
	/** Query that created this result. Required for generating links to the hit/document with the proper results highlighted. */
	query: BLSearchParameters;
};

/**
 * Due to parallel searching, and wanting to highlight the words in both versions of the document,
 * hits are displayed in their own little mini-tables
 * Usually for non-parallel searches there's only one row, but when searching in parallel corpora,
 * there can be multiple.
 * Due to this, a HitRow actually contains multiple HitRowContexts, which represent the actual rows, one for every "version" of the hit.
 * (e.g. one in the Dutch version of the document, one in the English version of the document)
 * For consistency, we call the main rows HitRow/DocRow/GroupRow, and this subobject HitRowContext.
 */
export type HitRowContext = {
	doc: BLDoc;
	hit: BLHit|BLHitSnippet;
	/** Is the data in this hit from the searched field or from the parallel/related/target field. False if source, true if target. */
	isForeign: boolean;
	context: HitContext;
	/** For parallel corpora. The url to view the hit in the document's version in the target field. */
	href: string;
	/** For parallel corpora. The field in which this version of the hit exists. */
	annotatedField: NormalizedAnnotatedField;
	dir: 'ltr'|'rtl';

	// TODO jesse
	gloss_fields: GlossFieldDescription[];
	hit_first_word_id: string; // Jesse
	hit_last_word_id: string // jesse
	hit_id: string; // jesse
}

export type HitRowData = {
	type: 'hit';
	rows: HitRowContext[];
}

export type DocRowData = {
	type: 'doc';
	summary: string;
	href: string;
	doc: BLDoc,
	hits?: HitRowData[]
};

function start(hit: BLHit): number;
function start(hit: BLHitSnippet|undefined): undefined;
function start(hit: BLHitSnippet|BLHit|undefined): number|undefined {
	return (hit as BLHit&BLHitSnippet)?.start;
}

function input(result: BLSearchResult, doc: BLDocInfo, hit: BLHit|BLHitInOtherField): Result<BLHit>;
function input(result: BLSearchResult, doc: BLDoc, hit: BLHitSnippet): Result<BLHitSnippet>;
function input(result: BLSearchResult, doc: BLDoc): Result<undefined>;
function input(result: BLSearchResult, doc: BLDocInfo|BLDoc, hit?: BLHit|BLHitInOtherField|BLHitSnippet): Result {
	return {doc: typeof doc.docPid === 'string' ? doc as BLDoc : {docPid: (hit as BLHit).docPid, docInfo: doc as BLDocInfo}, hit, query: result.summary.searchParam};
}

function makeDocRow(p: Result, info: DisplaySettingsForRows): DocRowData {
	return {
		doc: p.doc,
		href: getDocumentUrl(p.doc.docPid, info.sourceField.id, undefined, p.query.patt, p.query.pattgapdata, undefined),
		summary: info.getSummary(p.doc.docInfo, info.specialFields),
		type: 'doc',
		hits: p.doc.snippets?.length ? p.doc.snippets.map(s => makeRowsForHit({...p, hit: s}, info, undefined)) : undefined
	}
}

/** Extract the document's own text director (for mixed corpora). See https://github.com/INL/corpus-frontend/issues/520 */
function docDir(doc: BLDoc, corpusNativeDir: 'ltr'|'rtl'): 'ltr'|'rtl' {
	switch (doc.docInfo.textDirection?.[0]) {
		case 'ltr':
		case 'rtl': return doc.docInfo.textDirection[0];
		default: return corpusNativeDir;
	}
}

function makeHitRow(p: Result<BLHitInOtherField|BLHit|BLHitSnippet>, info: DisplaySettingsForRows, highlightColors: Record<string, TokenHighlight>|undefined, field: NormalizedAnnotatedField): HitRowContext {
	return {
		doc: p.doc,
		hit: p.hit,
		context: snippetParts(p.hit, highlightColors),
		href: getDocumentUrl(p.doc.docPid, field.id, info.sourceField.id, p.query.patt, p.query.pattgapdata, start(p.hit)),
		isForeign: field !== info.sourceField,
		annotatedField: field,
		dir: docDir(p.doc, info.dir),

		// TODO
		gloss_fields: [],
		hit_first_word_id: '',
		hit_id: '',
		hit_last_word_id: '',
	}
}

function makeDocRows(results: BLDocResults, info: DisplaySettingsForRows): DocRowData[] {
	return results.docs.map(doc => makeDocRow(input(results, doc), info));
}

function makeHitRows(results: BLHitResults, info: DisplaySettingsForRows): Array<DocRowData|HitRowData> {
	// First, merge the matchInfos from the main hit with the otherFields hits.
	// This is required to highlight hits in parallel corpora.
	Highlights.mergeMatchInfos(results);
	const r: Array<DocRowData|HitRowData> = [];
	let prevRes: Result|undefined;
	const colors = Highlights.getHighlightColors(results.summary);
	for (const hit of results.hits) {
		if (prevRes?.doc.docPid !== hit.docPid) { // every time the doc changes, add a new doc title row.
			prevRes = input(results, results.docInfos[hit.docPid], hit);
			r.push(makeDocRow(prevRes, info));
		}
		r.push(makeRowsForHit({...prevRes, hit}, info, colors));
	}
	return r;
}
function makeRowsForHit(p: Result<BLHit|BLHitSnippet|BLHitInOtherField>, info: DisplaySettingsForRows, highlightColors: Record<string, TokenHighlight>|undefined): HitRowData {
	const r: HitRowData = {
		type: 'hit',
		rows: [makeHitRow(p, info, highlightColors, info.sourceField)]
	};
	if ('otherFields' in p.hit && info.targetFields.length) {
		const h = p.hit as BLHit;
		r.rows.push(...info.targetFields
			.filter(f => h.otherFields?.[f.id])
			.map(targetField => makeHitRow({...p, hit: h.otherFields![targetField.id]}, info, highlightColors, targetField))
		);
	}
	return r;
}

function makeGroupRows(results: BLDocGroupResults|BLHitGroupResults, defaultGroupName: string): { rows: GroupRowData[], maxima: Maxima } {
	const max = new MaxCounter<GroupRowData>();

	const mapHitGroup = (g: BLHitGroupResult, summary: BLHitGroupResults['summary']) => ({
		type: 'group',
		id: g.identity || defaultGroupName,
		size: g.size,
		displayname: g.properties.concat().sort((a,b) => a.name.localeCompare(b.name)).map(v => v.value).join('·') || defaultGroupName,

		'r.d': summary.numberOfDocs,
		// When a pattern was used (which is always when we have hits), we can't know this (should be tokensInMatchedDocuments, but that't not returned for grouped queries)
		'r.t': undefined, // TODO wait for jan. Should be total tokens in all docs with a hit.
		'r.h': summary.numberOfHits,

		'gr.d': g.numberOfDocs,
		'gr.t': undefined, // TODO wait for jan, is more specific than subcorpusSize, since should only account for docs with hits.
		'gr.h': g.size,

		'gsc.d': g.subcorpusSize?.documents,
		'gsc.t': g.subcorpusSize?.tokens,

		'sc.d': summary.subcorpusSize.documents,
		'sc.t': summary.subcorpusSize.tokens
	} as const);
	const mapDocGroup = (g: BLDocGroupResult, summary: BLDocGroupResults['summary']) => ({
		type: 'group',
		id: g.identity,
		size: g.size,
		displayname: g.properties.sort((a,b) => a.name.localeCompare(b.name)).map(v => v.value).join('·') || defaultGroupName,

		'r.d': summary.numberOfDocs,
		// When a pattern was used, we can't know this (should be tokensInMatchedDocuments, but that't not returned for grouped queries)
		'r.t': summary.searchParam.patt ? undefined : summary.subcorpusSize.tokens,
		'r.h': summary.numberOfHits,

		'gr.d': g.size,
		'gr.t': g.numberOfTokens,
		'gr.h': undefined, // TODO add when jan makes available, something like g.numberOfHits?

		'gsc.d': g.subcorpusSize.documents,
		'gsc.t': g.subcorpusSize.tokens,

		'sc.d': summary.subcorpusSize.documents,
		'sc.t': summary.subcorpusSize.tokens
	} as const);

	const stage1 =
		isHitGroups(results) ? results.hitGroups.map(g => mapHitGroup(g, results.summary)) :
		isDocGroups(results) ? results.docGroups.map(g => mapDocGroup(g, results.summary)) : [];
	// we know the global maximum of this property, so might as well use it.
	max.add(isHitGroups(results) ? 'gr.h' : 'gr.d', results.summary.largestGroupSize);

	const rows = stage1.map<GroupRowData>(row => {
		const r: GroupRowData = {
			...row,
			'relative group size [gr.d/r.d]': row['gr.d'] / row['r.d'],
			'relative group size [gr.t/r.t]': row['gr.t'] && row['r.t'] ? row['gr.t']! / row['r.t'] : undefined,
			'relative group size [gr.h/r.h]': (row['gr.h'] && row['r.h']) ? row['gr.h']! / row['r.h']! : undefined,

			'relative frequency (docs) [gr.d/gsc.d]':   row['gsc.d']                 ? row['gr.d']  / row['gsc.d']! : undefined,
			'relative frequency (tokens) [gr.t/gsc.t]': row['gr.t']  && row['gsc.t'] ? row['gr.t']! / row['gsc.t']! : undefined,
			'relative frequency (hits) [gr.h/gsc.t]':   row['gr.h']  && row['gsc.t'] ? row['gr.h']! / row['gsc.t']! : undefined,

			'relative frequency (docs) [gr.d/sc.d]':   row['sc.d'] ? row['gr.d'] / row['sc.d']! : undefined,
			'relative frequency (tokens) [gr.t/sc.t]': row['gr.t'] && row['sc.t'] ? row['gr.t']! / row['sc.t']! : undefined,

			'average document length [gr.t/gr.d]': row['gr.t'] ? Math.round(row['gr.t']! / row['gr.d']) : undefined,
		};

		Object.entries(r).forEach(([k, v]: [keyof GroupRowData, GroupRowData[keyof GroupRowData]]) => max.add(k as any, v as any));
		return r;
	});

	return {
		rows,
		maxima: max.values
	};
}

export type Maxima = Record<KeysOfType<GroupRowData, number>, number>;
export type Rows = {
	rows: Array<DocRowData|HitRowData|GroupRowData>;
	maxima?: Maxima;
}

export function makeRows(results: BLSearchResult, info: DisplaySettingsForRows): Rows {
	if (isDocResults(results)) return { rows: makeDocRows(results, info) }
	else if (isHitResults(results)) return { rows: makeHitRows(results, info) }
	else return makeGroupRows(results, info.i18n.$t('results.groupBy.groupNameWithoutValue').toString());
}

type SortOption = {
	label: string;
	title: string;
	value: string;
}

type ColumnDefBase = {
	key: string;
	label: string;
	debugLabel?: string;
	title?: string;
	sort?: string|SortOption[];
	textAlignClass?: string;
	colspan?: number|string;
}

// we want either a single sort with a title holding the 'sort by' text
// or multiple sorts without a title
// or no sort at all with a title

export type ColumnDefHit = ColumnDefBase & ({
	/** Column shows the tokens of the hit, either the before/match/after, which get special treatment, or another annotation, but in that case the match is shown. */
	field: 'before'|'match'|'after'|'annotation';
	annotation: NormalizedAnnotation;
}|{
	/** Column shows the value of a metadata field in the document of the hit in the current row. */
	field: 'metadata',
	metadata: NormalizedMetadataField
}|{
	/** Column shows the name of the AnnotatedField of the hit in the current row. */
	field: 'annotatedField',
});

export type ColumnDefDoc = ColumnDefBase & {
	field: 'summary'|'metadata'|'hits';
	metadata?: NormalizedMetadataField;
}
export type ColumnDefGroup<T extends keyof GroupRowData = keyof GroupRowData> = ColumnDefBase & {
	field: 'group';
	labelField: T;
	barField?: KeysOfType<GroupRowData, number>;
	showAsPercentage?: Required<GroupRowData>[T] extends number ? boolean : never;
}

export type ColumnDef = ColumnDefHit|ColumnDefDoc|ColumnDefGroup;
export type ColumnDefs = {
	hitColumns: ColumnDefHit[];
	docColumns: ColumnDefDoc[];
	groupColumns: ColumnDefGroup[];
	groupModeOptions: DisplaySettingsForColumns['groupDisplayMode'][];
}

export function makeColumns(results: BLSearchResult, info: DisplaySettingsForColumns): ColumnDefs {
	const docColumns: ColumnDefDoc[] = [];
	const hitColumns: ColumnDefHit[] = [];
	const groupColumns: ColumnDefGroup[] = [];
	const i = info.i18n;

	/// DOCS

	docColumns.push({
		key: 'doc_summary',
		field: 'summary',
		label: i.$t('results.table.document').toString(),
		title: info.specialFields.titleField ? i.$t('results.table.sortByDocument').toString() : undefined,
		sort: info.specialFields.titleField ? `field:${info.specialFields.titleField}` : undefined,
		textAlignClass: info.dir === 'rtl' ? 'text-right' : 'text-left',
	});

	if (isDocResults(results)) {
		docColumns.push(...info.metadata.map(m => ({
			key: 'doc_metadata_' + m.id,
			field: 'metadata' as const,
			label: i.$tMetaDisplayName(m).toString(),
			debugLabel: m.id,
			title: i.$t('results.table.sortBy', {field: i.$tMetaDisplayName(m).toString()}).toString(),
			sort: `field:${m.id}`,
			metadata: m
		})));

		if(results.docs[0].snippets) {
			docColumns.push({
				key: 'doc_hits',
				field: 'hits',
				label: i.$t('results.table.hits').toString(),
				sort: `numhits`,
			})
		}
	}

	/// HITS

	const leftLabelKey = info.dir === 'rtl' ? 'results.table.columnLabelAfterHit' : 'results.table.columnLabelBeforeHit';
	const centerLabelKey = 'results.table.columnLabelHit';
	const rightLabelKey = info.dir === 'rtl' ? 'results.table.columnLabelBeforeHit' : 'results.table.columnLabelAfterHit';
	const blSortPrefixLeft = info.dir === 'rtl' ? 'after' : 'before'; // e.g. before:word or before:lemma
	const blSortPrefixCenter = 'hit'; // e.g. hit:word or hit:lemma
	const blSortPrefixRight = info.dir === 'rtl' ? 'before' : 'after'; //. e.g. after:word or after:lemma

	const contextAnnots = info.sortableAnnotations || [];
	const otherAnnots = info.otherAnnotations || [];
	const meta = info.metadata || [];

	const sortAnnot = (a: NormalizedAnnotation, prefix: string): SortOption => ({
		label: i.$tAnnotDisplayName(a),
		title: i.$t('results.table.sortBy', {field: i.$tAnnotDisplayName(a)}).toString(),
		value: `${prefix}:${a.id}`,
	})

	const sorts = (a: NormalizedAnnotation[]|undefined, prefix: string): {sort: SortOption[]}|{title: string, sort: string}|{} => {
		if (a?.length === 1) {
			const {title, value: sort} = sortAnnot(a[0], prefix);
			return {title, sort};
		} else if (a?.length) return a.map(a => sortAnnot(a, prefix));
		else return {};
	}

	if (isHitResults(results) && !!results.hits.find(h => !!h.otherFields)) {
		hitColumns.push({
			key: 'annotatedField',
			field: 'annotatedField',
			label: i.$t('results.table.parallelVersion').toString(),
		});
	}




	hitColumns.push({
		key: 'left',
		debugLabel: info.mainAnnotation.id,
		textAlignClass: 'text-right',
		...sorts(contextAnnots, blSortPrefixLeft),
		label: i.$t(leftLabelKey).toString(),
		field: info.dir === 'rtl' ? 'after' : 'before',
		annotation: info.mainAnnotation
	}, {
		key: 'hit',
		label: i.$t(centerLabelKey).toString(),
		debugLabel: info.mainAnnotation.id,
		textAlignClass: 'text-center',
		...sorts(contextAnnots, blSortPrefixCenter),
		field: 'match',
		annotation: info.mainAnnotation
	}, {
		key: 'right',
		label: i.$t(rightLabelKey).toString(),
		debugLabel: info.mainAnnotation.id,
		textAlignClass: 'text-left',
		...sorts(contextAnnots, blSortPrefixRight),
		field: info.dir === 'rtl' ? 'before' : 'after',
		annotation: info.mainAnnotation
	});

	if (isHitResults(results)) {
		hitColumns.push(
			...otherAnnots.map(a => ({
				key: `annot_${a.id}`,
				label: i.$tAnnotDisplayName(a),
				debugLabel: a.id,
				textAlignClass: info.dir === 'rtl' ? 'text-right' : 'text-left',
				...sorts([a], 'annotation'),
				field: 'annotation' as const,
				annotation: a
			})),
			...meta.map(m => ({
				key: `meta_${m.id}`,
				label: i.$tMetaDisplayName(m),
				debugLabel: m.id,
				textAlignClass: info.dir === 'rtl' ? 'text-right' : 'text-left',
				title: i.$t('results.table.sortBy', {field: i.$tMetaDisplayName(m)}).toString(),
				sort: `field:${m.id}`,
				field: 'metadata' as const,
				metadata: m
			}))
		)
	}

	const tableWidth = (isHitResults(results) ? hitColumns : isGroups(results) ? groupColumns : docColumns).reduce((width, col) => width + (typeof col.colspan === 'number' ? col.colspan : 1), 0);
	if (isHitResults(results))
		docColumns[0].colspan = Math.max(1, tableWidth - (docColumns.length - 1));
	else {
		hitColumns.forEach(c => {
			c.colspan = (1 / hitColumns.length) * 100 + '%'
			// c.textAlignClass = 'text-center';
			c.sort = undefined;
			c.title = undefined;
		});
	}
	/// TODO
	// else if (isDocResults(results))
	// 	hitColumns
	// hitColumns.length;

	/// GROUPS

	if (!isGroups(results)) return {hitColumns, docColumns, groupColumns, groupModeOptions: []};
	const groupType = isDocGroups(results) ? 'docs' : 'hits';
	const groupedBy = results.summary.searchParam.group!.match(/field:|decade/) ? 'metadata' : 'annotation';
	let availableDisplayModes = Object.keys(displayModes[groupType][groupedBy]) as DisplaySettingsForColumns['groupDisplayMode'][];

	// Hide the relative tokens view when results are filtered based on a cql pattern
	if (groupType === 'docs' && results.summary.pattern) { availableDisplayModes = availableDisplayModes.filter(o => o !== 'tokens'); }
	let displayMode = info.groupDisplayMode;
	if (!availableDisplayModes.includes(displayMode)) {
		console.error('Unknown group displaymode', {displayMode, availableDisplayModes, groupType, groupedBy});
		// should always be available?
		displayMode = 'table';
	}

	let columns = displayModes[groupType][groupedBy][displayMode]; // UGH..
	if (!columns) {console.error('Undefined table layout for ', {groupType, groupedBy, displayMode}); columns = [];}

	columns.forEach(c => {
		const [barField, labelField] = typeof c === 'string' ? [undefined, c] : c;
		// headers for hits/docs can override (part of) the default header.
		const header = Object.assign({}, tableHeaders.default[labelField], tableHeaders[groupType][labelField]);
		groupColumns.push({
			field: 'group',
			key: c.toString(),
			label: header.label!,
			title: header.title,
			labelField,
			barField: barField as any,
			showAsPercentage: labelField.includes('relative') as any, // HACK, all relative fields are percentages, and no other fields are.
			sort: header.sortProp,
		})
	});



	return {hitColumns, docColumns, groupColumns, groupModeOptions: availableDisplayModes};
}
