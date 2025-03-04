import { BLDoc, BLDocFields, BLDocGroupResults, BLDocInfo, BLDocResults, BLHit, BLHitGroupResults, BLHitInOtherField, BLHitResults, BLHitSnippet, BLHitSnippetPart, BLMatchInfo, BLMatchInfoList, BLMatchInfoRelation, BLMatchInfoSpan, BLSearchParameters, BLSearchResult, BLSearchSummary, BLSearchSummaryTotalsHits, hitHasParallelInfo, isDocGroups, isDocResults, isGroups, isHitGroups, isHitResults } from '@/types/blacklabtypes';
import { CaptureAndRelation, HitContext, HitToken, NormalizedAnnotatedField, NormalizedAnnotatedFieldParallel, NormalizedAnnotation, NormalizedMetadataField, TokenHighlight } from '@/types/apptypes';
import { getDocumentUrl, mapReduce } from '@/utils';
import { corpusCustomizations } from '@/store/search/ui';
import { displayModes, GroupData, GroupRowData, MaxCounter, tableHeaders } from '@/pages/search/results/table/groupTable';
import { GlossFieldDescription } from '@/store/search/form/glossStore';
import { KeysOfType } from '@/types/helpers';

export namespace Highlights {
	/** Part of a hit/context to highlight, with a label, display and boolean whether it's a relation or a section of the query/result labelled by the user. */
	export type HighlightSection = {
		/** -1 for root */
		sourceStart: number;
		/** -1 for root */
		sourceEnd: number;
		targetStart: number;
		targetEnd: number;
		targetField?: string;

		/** True if this is a relation, false if this is a capture group */
		isRelation: boolean;

		/** Should this be permanently higlighted? (if not, may still be hoverable if this is a parallel corpus) */
		showHighlight: boolean;

		/**
		 * Key of this info as reported by BlackLab.
		 * E.g. for a query "_ -obj-> _" this would be "obj".
		 * For an anonymous relation e.g. _ --> _ this would be something like "dep1" or "rel1"
		 * For a capture group, e.g. "a:[] b:[]" this would be the name of the capture group, "a" or "b".
		 *
		 * Can be used for e.g. grouping results (and we do use this, mind when refactoring.)
		 */
		key: string;

		/** Display string, key if !isRelation, relation value + arrow if isRelation == true */
		display: string;
	}

	// these should be alright for colorblind people.
	// taken from https://personal.sron.nl/~pault/#sec:qualitative
	const colors = [
		'#77AADD',
		'#EE8866',
		'#EEDD88',
		'#FFAABB',
		'#99DDFF',
		'#44BB99',
		'#BBCC33',
		'#AAAA00',
		'#DDDDDD',
	]

	const color = (key: string, i: number): TokenHighlight => ({
		key,
		color: colors[i % colors.length],
		textcolor: 'black',
		textcolorcontrast: 'white'
	});

	function mapCaptureList(key: string, list: BLMatchInfoList): HighlightSection[] {
		return list.infos.map((info, index) => ({
			...info,
			isRelation: info.type === 'relation',
			showHighlight: true,
			sourceEnd: info.sourceEnd ?? -1,
			sourceStart: info.sourceStart ?? -1,
			key: `${key}[${index}]`,
			display: info.relType,
		}));
	}

	function mapCaptureRelation(key: string, relation: BLMatchInfoRelation): HighlightSection {
		return {
			...relation,
			sourceStart: relation.sourceStart ?? -1,
			sourceEnd: relation.sourceEnd ?? -1,
			isRelation: true,
			showHighlight: true,
			key,
			display: relation.relType,
		};
	}

	function mapCaptureSpan(key: string, span: BLMatchInfoSpan): HighlightSection {
		return {
			sourceEnd: span.end,
			sourceStart: span.start,
			targetEnd: span.end,
			targetStart: span.start,
			isRelation: false,
			showHighlight: true,
			key,
			display: key,
		};
	}

	/**
	 * Extract matches and capture groups we're interested in for highlighting and (potentially) grouping.
	 * Because we run this once per hit, it's important that the order of the captures we return is consistent.
	 * Because we assign colors based on the index, and we want them to be consistent for every hit.
	 *
	 * TODO what if there are optional parts of a query, or the query has "or" in it with different highlights on the branches.
	 *
	 * @param matchInfos The matchInfos object from a single hit.
	 * @returns
	 */
	export function getHighlightSections(matchInfos: NonNullable<BLHit['matchInfos']>): HighlightSection[] {
		let interestingCaptures = Object.entries(matchInfos).flatMap<HighlightSection>(([key, info]) => {
			// captured_rels happens when we ask BlackLab to explicitly return all relations in the hit,
			// So ignore that, as we'd be highlighting every word in the sentence if we did.
			// (this happens when requesting context to display in the UI, for example.)
			// (NOTE: "captured_rels" is the default capture name for rcap() operations,
			//        so if the query is "(...SOME_QUERY...) within rcap(<s/>)", the "captured_rels" capture
			//        will contain all relations in the sentence)
			if (key === 'captured_rels') return [];

			// A list of relations, such as returned by the ==>TARGETVERSION (parallel alignment) operator
			// or a call to rcap(). Return the captured relations, but include the list index in the name.
			if (info.type === 'list') return mapCaptureList(key, info);
			// A single relation
			else if (info.type === 'relation') return mapCaptureRelation(key, info);
			// A span, e.g. an explicit capture.
			// Set the source and target to the same span so it's the same structure as a relation.
			else if (info.type === 'span') return mapCaptureSpan(key, info);
			else return []; // type === 'tag'. We don't care about highlighting stuff in between tags (that would be for example every word in a sentence - not very useful)
		})
		// Important that this returns a sorted list, as we assign colors based on the index.
		.sort((a, b) => a.key.localeCompare(b.key))

		// Allow custom script to determine what to highlight for this hit
		// (i.e. "do (hover)highlight word alignments, but not verse alignments")
		/** I.E. are there captures (e.g. a:[]) or only relations? */
		const hasExplicitCaptures = interestingCaptures.find(c => !c.isRelation) !== undefined;

		const result: HighlightSection[] = interestingCaptures
			.map(mi => {
				// always highlight if the user "captured" (i.e. labelled this token in the query),
				// OR if this is a relation and there are no explicit captures.
				// Even if this is false, the highlight will appear up if the user hovers over the hit.
				// This only controls whether it's always shown.
				const shouldHighlightByDefault = !mi.isRelation || !hasExplicitCaptures;
				const shouldHighlightByCustomizations = corpusCustomizations.results.matchInfoHighlightStyle(mi);

				if (shouldHighlightByCustomizations === 'none') {
					// this capture/relation should never be highlighed.
					// remove this from the list.
					return null;
				} else if (shouldHighlightByCustomizations === 'static') {
					// true signifies that this should always be highlighted.
					mi.showHighlight = true;
				} else if (shouldHighlightByCustomizations === 'hover') {
					// false signifies that this should only be highlighted on hover.
					mi.showHighlight = false;
				} else {
					// Script returned null or undefined, or something else we don't understand.
					// Use the default behavior.
					mi.showHighlight = shouldHighlightByDefault;
				}

				return mi;
			})
			.filter(mi => mi !== null)

		return result;
	}

	/**
	 * Get a color for every relation and capture.
	 * This ensures that we use the same color everywhere for the same relation/capture.
	 * The returned colors are keyed by the matchInfos key as reported by BlackLab
	 *
	 * E.g. for a query "_ -obj-> _" the color would be under "obj".
	 * For an anonymous relation e.g. _ --> _ this the color would be under something like "dep" or "rel"
	 * For a capture group, e.g. "a:[] b:[]" this would be the name of the capture group, "a" or "b".
	 *
	 * We use this for highlighting the hits in the UI.
	 */
	export function getHighlightColors(summary: BLSearchSummary): Record<string, TokenHighlight> {
		return mapReduce(Object.keys(summary.pattern?.matchInfos ?? {}).sort(), (hl, i) => color(hl, i));
	}
}

/**
 * Flatten a set of arrays into an array of sets.
 * { a: [], b: [] } ==> [ { a: '', b: '' }, { a: '', b: '' }]
 *
 * @param part The part of the hit on which to do this.
 * @param annotationId the annotation to put into the main 'text' property of the token.
 * @param punctuationSettings BlackLab sends punctuation BEFORE the token, with a trailing value at the end
 *                            This doesn't align nicely with how we want to render it, so we have to scoot over the punctuation
 *                            Generally, we remove punctation at the very start and end, and move the punctation at the end of the hit over to the after context.
 */
function flatten(part: BLHitSnippetPart|undefined, annotationId: string, punctuationSettings: {punctAfterLastWord?: string, firstPunct?: boolean}): HitToken[] {
	if (!part) return [];
	/** The result array */
	const r: HitToken[] = [];
	const length = part[annotationId].length;
	for (let i = 0; i < part[annotationId].length; i++) {
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
 * @param annotationId - annotation to put in the token's main 'text' property. Usually whatever annotation contains the words.
 * @param colors - which colors to use for highlighting. This is usually the result of getHighlightColors. If omitted, no highlighting will be done.
 *
 * @returns the hit split into before, match, and after parts, with capture and relation info added to the tokens. The punct is to be shown after the word.
 */
export function snippetParts(hit: BLHit|BLHitSnippet, annotationId: string, colors?: Record<string, TokenHighlight>): HitContext {
	// NOTE: the original BLS API was designed before RTL support and uses left/right to mean before/after.
	//       the new BLS API correctly uses before/after, which makes sense for both LTR and RTL languages.
	const before = flatten(hit.left, annotationId, {punctAfterLastWord: hit.match.punct[0]});
	const match = flatten(hit.match, annotationId, {});
	const after = flatten(hit.right, annotationId, {firstPunct: true});

	// Only extract captures if have the necessary info to do so.
	if (!('start' in hit) || !hit.matchInfos || !colors)
		return { before, match, after };

	const highlights = Highlights.getHighlightSections(hit.matchInfos);

	/** Return those entries in the highlights array where source/target overlaps with the globalTokenIndex */
	const findHighlightsByTokenIndex = (globalTokenIndex: number): undefined|CaptureAndRelation[] => highlights.reduce<undefined|CaptureAndRelation[]>((matches, c) => {
		// first see if we're in the matched area for the capture/relation

		// For cross-field relations in parallel corpora, we want to make sure we only
		// highlight either source or target. If targetField is '__THIS__', we're the target,
		// otherwise we're the source.
		// (for single-field relations, we always want to highlight both source and target)
		const isCrossFieldRelation = 'targetField' in c;
		const areWeTarget = !isCrossFieldRelation || c.targetField === '__THIS__';
		const areWeSource = !isCrossFieldRelation || !areWeTarget;

		const isSource = areWeSource && c.sourceStart <= globalTokenIndex && globalTokenIndex < c.sourceEnd;
		const isTarget = areWeTarget && c.targetStart <= globalTokenIndex && globalTokenIndex < c.targetEnd;
		if (isSource || isTarget) {
			// we matched, add it to the matches.
			const colorIndex = c.key.replace(/\[\d+\]$/g, '');
			matches = matches ?? [];

			// "fix" for not having highlight colors in otherFields....
			const FALLBACK_COLOR = {color: 'black', textcolor: 'white', textcolorcontrast: 'black'};

			matches.push({
				key: c.key,
				display: c.isRelation ? (isSource ? c.display + '-->' : /*isTarget*/ '-->' + c.display) : c.display,
				highlight: colors[colorIndex] || FALLBACK_COLOR,
				showHighlight: c.showHighlight,
				isSource: c.isRelation && isSource,
				isTarget: c.isRelation && isTarget
			});
		}
		return matches;
	}, undefined);

	before.forEach((token, i) => token.captureAndRelation = findHighlightsByTokenIndex(i + hit.start - before.length));
	match.forEach((token, i) => token.captureAndRelation = findHighlightsByTokenIndex(i + hit.start));
	after.forEach((token, i) => token.captureAndRelation = findHighlightsByTokenIndex(i + hit.end));

	return {
		before,
		match,
		after
	};
}


/**
 * For hits with parallel information (e.g. hit in english with dutch alignments from other fields).
 * Enrich the hit in the target with match/relation info.
 * This is required because BlackLab only includes the relation info at the source, not at the target.
 * But we want that info in the target as well, so we can highlight it.
 */
export function mergeMatchInfos(data: BLHitResults): BLHitResults {
	// Copy relations to their target field hit, so we can later render that hit as a relation target
	// (the matchInfo is copied there, with targetField set to the special string __THIS__)
	data.hits.forEach(hit => {
		if (hit.matchInfos && hit.otherFields) {
			hit.otherFields = Object.fromEntries(
				Object.entries(hit.otherFields).map(([k, v] : [string, BLHitInOtherField]) => {
					return [k, processHit(k, v, hit.matchInfos!)];
				})
			);
		}
	});

	// Actually copy the matchInfos to the target field hit from the main hit matchInfos
	function processHit(
		targetFieldName: string,
		targetHit: BLHitInOtherField,
		sourceHitMatchInfos: Record<string, BLMatchInfo>
	): BLHitInOtherField {
		if (Object.keys(sourceHitMatchInfos).length === 0) {
			// Nothing to merge
			return targetHit;
		}

		/** Does the given matchInfo's targetField point to us?
		 * If it's a list, do any of the list's elements target us?
		 */
		function matchInfoHasUsAsTargets([name, matchInfo]: [string, BLMatchInfo]): boolean {
			if ('targetField' in matchInfo && matchInfo.targetField === targetFieldName)
				return true;
			if (matchInfo.type === 'list') {
				const infos = matchInfo.infos as BLMatchInfo[];
				if (infos.some(l => 'targetField' in l && l.targetField === targetFieldName))
					return true;
			}
			return false;
		};

		// Mark targetField as __THIS__ so we'll know it is us later
		function markTargetField(matchInfo: BLMatchInfo) {
			return 'targetField' in matchInfo ? ({ ...matchInfo, targetField: '__THIS__'}) : matchInfo;
		}

		// Keep only relations with us as the target field (and mark it, see above)
		const toMerge = Object.entries(sourceHitMatchInfos)
			.filter(matchInfoHasUsAsTargets)
			.reduce((acc, [name, matchInfo]) => {
				if ('infos' in matchInfo) {
					acc[name] = acc[name] = {
						...matchInfo,
						infos: matchInfo.infos.map(markTargetField) as BLMatchInfoRelation[]
					};
				} else {
					acc[name] = markTargetField(matchInfo);
				}
				return acc;
			}, {} as Record<string, BLMatchInfo>);

		if (!targetHit.matchInfos || Object.keys(targetHit.matchInfos).length === 0) {
			// Hit has no matchInfos of its own; just use the infos from the main hit
			return {
				...targetHit,
				matchInfos: toMerge
			};
		}

		// Construct a new hit with matchInfos merged together
		const newHit = {...targetHit};
		newHit.matchInfos = {...toMerge, ...targetHit.matchInfos};
		return newHit;
	}
	return data;
}

// ===================

export type DisplaySettings = {
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

type Result<HitType extends BLHit|BLHitSnippet|BLHitInOtherField|undefined = BLHit|BLHitSnippet|BLHitInOtherField|undefined> = {
	doc: BLDoc;
	hit: HitType;
	/** Query that created this result. Required for generating links to the hit/document with the proper results highlighted. */
	query: BLSearchParameters;
};

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
};

export {GroupRowData} from '@/pages/search/results/table/groupTable';

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

function makeDocRow(p: Result, info: DisplaySettings): DocRowData {
	return {
		doc: p.doc,
		href: getDocumentUrl(p.doc.docPid, info.sourceField.id, undefined, p.query.patt, p.query.pattgapdata, undefined),
		summary: info.getSummary(p.doc.docInfo, info.specialFields),
		type: 'doc',
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

function makeHitRow(p: Result<BLHitInOtherField|BLHit|BLHitSnippet>, info: DisplaySettings, highlightColors: Record<string, TokenHighlight>|undefined, field: NormalizedAnnotatedField): HitRowContext {
	const dir = docDir(p.doc, info.dir);
	return {
		doc: p.doc,
		hit: p.hit,
		context: snippetParts(p.hit, info.mainAnnotation.id, highlightColors),
		href: getDocumentUrl(p.doc.docPid, field.id, info.sourceField.id, p.query.patt, p.query.pattgapdata, start(p.hit)),
		isForeign: field !== info.sourceField,
		annotatedField: field,
		dir,

		// TODO
		gloss_fields: [],
		hit_first_word_id: '',
		hit_id: '',
		hit_last_word_id: '',
	}
}

function makeDocRows(results: BLDocResults, info: DisplaySettings): Array<DocRowData|HitRowData> {
	const highlightColors = Highlights.getHighlightColors(results.summary);
	const r: Array<DocRowData|HitRowData> = [];
	for (const doc of results.docs) {
		const data: Result = {doc, hit: undefined, query: results.summary.searchParam};
		r.push(makeDocRow(data, info));
		doc.snippets?.forEach(hit => r.push({type: 'hit', rows: [makeHitRow({...data, hit}, info, highlightColors, info.sourceField)]}));
	}
	return r;
}


function makeHitRows(results: BLHitResults, info: DisplaySettings): Array<DocRowData|HitRowData> {
	// First, merge the matchInfos from the main hit with the otherFields hits.
	// This is required to highlight hits in parallel corpora.
	mergeMatchInfos(results);
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
function makeRowsForHit(p: Result<BLHit>, info: DisplaySettings, highlightColors: Record<string, TokenHighlight>): HitRowData {
	return {
		type: 'hit',
		rows: [
			makeHitRow(p, info, highlightColors, info.sourceField),
			...info.targetFields
				.filter(f => p.hit.otherFields?.[f.id])
				.map(f => makeHitRow({...p, hit: p.hit.otherFields![f.id]}, info, highlightColors, f))
		]
	}

	// yield makeHitRow(p, info, highlightColors, info.sourceField);
	// for (const targetField of info.targetFields) {
	// 	const hitInOtherField = p.hit.otherFields?.[targetField.id];
	// 	if (!hitInOtherField) continue;
	// 	yield makeHitRow({...p, hit: hitInOtherField}, info, highlightColors, targetField);
	// }
}

/** Return those keys whose value is of type U */
// type PropertiesOfType<T, U> = Exclude<{[K in keyof T]: T[K] extends U | undefined ? K : never}[keyof T], undefined>;

// type AllValueTypes<T> = T[keyof T];
// type AllValueTypesExcept<T, U> = Exclude<AllValueTypes<T>, U>;


// type PropertiesOfType<T, U> = Exclude<T,



function makeGroupRows(results: BLDocGroupResults|BLHitGroupResults, defaultGroupName: string): { rows: GroupRowData[], maxima: Maxima } {
	const max = new MaxCounter<GroupRowData>();

	const stage1: GroupData[] = [];
	if (isHitGroups(results)) {
		const {summary, hitGroups} = results;
		// we know the global maximum of this property, so might as well use it.
		max.add('gr.h', summary.largestGroupSize);

		hitGroups.forEach(g => {
			stage1.push({
				type: 'group',
				id: g.identity || defaultGroupName,
				size: g.size,
				displayname: g.properties.sort((a,b) => a.name.localeCompare(b.name)).map(v => v.value).join('·') || defaultGroupName,

				'r.d': summary.numberOfDocs,
				'r.t': summary.subcorpusSize!.tokens, // FIXME augment request to make this available
				'r.h': summary.numberOfHits,

				'gr.d': g.numberOfDocs,
				'gr.t': undefined, // TODO wait for jan
				'gr.h': g.size,

				'gsc.d': (g.subcorpusSize ? g.subcorpusSize.documents : summary.subcorpusSize!.documents) || undefined,
				'gsc.t': (g.subcorpusSize ? g.subcorpusSize.tokens : summary.subcorpusSize!.tokens) || undefined,

				'sc.d': summary.subcorpusSize ? summary.subcorpusSize.documents : undefined, // TODO jan might make always available, remove check
				'sc.t': summary.subcorpusSize ? summary.subcorpusSize.tokens : undefined
			});
		});
	} else if (isDocGroups(results)) {
		const {summary, docGroups} = results;

		// we know the global maximum of this property, so might as well use it.
		max.add('gr.d', summary.largestGroupSize);

		docGroups.forEach(g => {
			// both are 0 in some cases, so mind that
			const sdocs = (g.subcorpusSize ? g.subcorpusSize.documents : summary.subcorpusSize!.documents) || undefined;
			const stokens = (g.subcorpusSize ? g.subcorpusSize.tokens : summary.subcorpusSize!.tokens) || undefined;
			const reldocs = g.size / summary.numberOfDocs;
			const reltokens = /*stokens ? g.numberOfTokens / stokens :*/ undefined; // can't really do more with this, we don't have the number of tokens in docs in this group, probably?
			const sreldocs = sdocs ? g.size / sdocs : undefined;
			const sreltokens = stokens ? g.numberOfTokens / stokens : undefined;

			stage1.push({
				type: 'group',
				id: g.identity,
				size: g.size,
				displayname: g.properties.sort((a,b) => a.name.localeCompare(b.name)).map(v => v.value).join('·') || defaultGroupName,

				'r.d': summary.numberOfDocs,
				'r.t': summary.tokensInMatchingDocuments!, // FIXME augment request to make this available
				'r.h': undefined, // summary.numberOfHits, TODO add when jan makes available

				'gr.d': g.size,
				'gr.t': g.numberOfTokens,
				'gr.h': undefined, // g.numberOfHits, TODO add when jan makes available

				'gsc.d': (g.subcorpusSize ? g.subcorpusSize.documents : summary.subcorpusSize!.documents) || undefined,
				'gsc.t': (g.subcorpusSize ? g.subcorpusSize.tokens : summary.subcorpusSize!.tokens) || undefined,

				'sc.d': summary.subcorpusSize ? summary.subcorpusSize.documents : undefined, // TODO jan might make always available, remove null check and make non-optional if/when
				'sc.t': summary.subcorpusSize ? summary.subcorpusSize.tokens : undefined
			});
		});
	}

	const rows = stage1.map<GroupRowData>((row: GroupData) => {
		const r: GroupRowData = {
			...row,
			'relative group size [gr.d/r.d]': row['gr.d'] / row['r.d'],
			'relative group size [gr.t/r.t]': row['gr.t'] ? row['gr.t']! / row['r.t'] : undefined,
			'relative group size [gr.h/r.h]': (row['gr.h'] && row['r.h']) ? row['gr.h']! / row['r.h']! : undefined,

			'relative frequency (docs) [gr.d/gsc.d]':   row['gsc.d']                 ? row['gr.d']  / row['gsc.d']! : undefined,
			'relative frequency (tokens) [gr.t/gsc.t]': row['gr.t']  && row['gsc.t'] ? row['gr.t']! / row['gsc.t']! : undefined,
			'relative frequency (hits) [gr.h/gsc.t]':   row['gr.h']  && row['gsc.t'] ? row['gr.h']! / row['gsc.t']! : undefined,

			'relative frequency (docs) [gr.d/sc.d]':   row['sc.d'] ? row['gr.d'] / row['sc.d']! : undefined,
			'relative frequency (tokens) [gr.t/sc.t]': row['gr.t'] && row['sc.t'] ? row['gr.t']! / row['sc.t']! : undefined,

			'average document length [gr.t/gr.d]': row['gr.t'] ? Math.round(row['gr.t']! / row['gr.d']) : undefined,

			type: 'group',
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
export function makeRows(results: BLSearchResult, info: DisplaySettings): Rows {
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
	colspan?: number;
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
	groupModeOptions: DisplaySettings['groupDisplayMode'][];
}

export function makeColumns(results: BLSearchResult, info: DisplaySettings): ColumnDefs {
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

	const contextAnnots = info. sortableAnnotations || [];
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
	},
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
	);




	const tableWidth = (isHitResults(results) ? hitColumns : isGroups(results) ? groupColumns : docColumns).reduce((width, col) => width + (col.colspan ?? 1), 0);
	if (isHitResults(results))
		docColumns[0].colspan = Math.max(1, tableWidth - (docColumns.length - 1));
	/// TODO
	// else if (isDocResults(results))
	// 	hitColumns
	// hitColumns.length;

	/// GROUPS

	if (!isGroups(results)) return {hitColumns, docColumns, groupColumns, groupModeOptions: []};
	const groupType = isDocGroups(results) ? 'docs' : 'hits';
	const groupedBy = results.summary.searchParam.group!.match(/field:|decade/) ? 'metadata' : 'annotation';
	let availableDisplayModes = Object.keys(displayModes[groupType][groupedBy]) as DisplaySettings['groupDisplayMode'][];

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
			key: typeof c === 'string' ? c : c[0],
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
