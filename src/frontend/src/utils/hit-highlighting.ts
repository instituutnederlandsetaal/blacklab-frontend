import { BLHit, BLHitInOtherField, BLHitResults, BLHitSnippet, BLHitSnippetPart, BLMatchInfo, BLMatchInfoList, BLMatchInfoRelation, BLMatchInfoSpan, BLSearchSummary, BLSearchSummaryTotalsHits } from '@/types/blacklabtypes';
import { CaptureAndRelation, HitContext, HitToken, TokenHighlight } from '@/types/apptypes';
import { mapReduce } from '@/utils';
import { corpusCustomizations } from '@/store/search/ui';

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

/**
 * Flatten a set of arrays into an array of sets.
 * { a: [], b: [] } ==> [ { a: '', b: '' }, { a: '', b: '' }]
 *
 * @param part The part of the hit on which to do this.
 * @param annotationId the annotation to put into the main 'text' property of the token.
 * @param lastPunctuation the punctuation after the last word.
 *                        BlackLab sends punctuation BEFORE the token, with a trailing value at the end,
 *                        we prefer to put punct AFTER the token, because it makes more sense when rendering before/hit/after.
 *                        E.G. "punctuation is dumb, " | "he said", instead of "punctuation is dumb" | ", he said"
 */
function flatten(part: BLHitSnippetPart|undefined, annotationId: string, lastPunctuation?: string): HitToken[] {
	if (!part) return [];
	/** The result array */
	const r: HitToken[] = [];
	const length = part[annotationId].length;
	for (let i = 0; i < part[annotationId].length; i++) {
		// punctuation is the whitespace before the current word. There is always one more punctuation than there are words in a document (fencepost problem).
		const punct =  (i === length - 1 ? lastPunctuation : part.punct[i+1]) || '';
		r.push({punct, annotations: {}});
	}
	for (const annotationId in part) {
		if (annotationId !== 'punct') // we already handled this.
		for (let i = 0; i < part[annotationId].length; i++) {
			r[i].annotations[annotationId] = part[annotationId][i];
		}
	}
	return r;
}


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
function getHighlightSections(matchInfos: NonNullable<BLHit['matchInfos']>): HighlightSection[] {
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
 * Given a BlackLab query's results, assign a color to every relation and capture.
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

/**
 * Split a hit into before, match, and after parts, with capture and relation info added to the tokens.
 * The punct is to be shown after the word.
 *
 * @param summary - the search summary, containing all matchInfos, so we can be sure to have the same color for every hit.
 * @param hit - the hit, or most of the hit in case of doc results (which contain less info than hits)
 * @param annotationId - annotation to put in the token's main 'text' property. Usually whatever annotation contains the words.
 * @param otherAnnotations - other annotations to return in the tokens. Lemma, pos, etc. depending on corpus and where in the UI we're showing this.
 * @param dir - direction of the text. LTR or RTL.
 * @param colors - which colors to use for highlighting. This is usually the result of getHighlightColors. If omitted, no highlighting will be done.
 *
 * @returns the hit split into before, match, and after parts, with capture and relation info added to the tokens. The punct is to be shown after the word.
 */
export function snippetParts(hit: BLHit|BLHitSnippet, annotationId: string, dir: 'ltr'|'rtl', colors?: Record<string, TokenHighlight>): HitContext {
	// NOTE: the original BLS API was designed before RTL support and uses left/right to mean before/after.
	//       the new BLS API correctly uses before/after, which makes sense for both LTR and RTL languages.
	const before = flatten(hit.left, annotationId, hit.match.punct[0]);
	const match = flatten(hit.match, annotationId, hit.right?.punct[0]);
	const after = flatten(hit.right, annotationId);

	// Only extract captures if have the necessary info to do so.
	if (!('start' in hit) || !hit.matchInfos || !colors)
		return { before, match, after };

	const highlights = getHighlightSections(hit.matchInfos);

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
export function mergeMatchInfos(data: BLHitResults) {
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
}