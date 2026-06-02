import { corpusCustomizations } from '@/pages/search/config/customization-callback-store';
import type { CaptureAndRelation, TokenHighlight } from '@/types/apptypes';
import type { BLHit, BLHitInOtherField, BLHitResults, BLMatchInfo, BLMatchInfoList, BLMatchInfoRelation, BLMatchInfoSpan, BLSearchSummaryPattern } from '@/types/blacklabtypes';
import type { UnionHelpers } from '@/types/helpers';

// #region docsmatchinfohighlightstyle
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
};
// #endregion docsmatchinfohighlightstyle

// these should be alright for colorblind people.
// taken from https://personal.sron.nl/~pault/#sec:qualitative
const colors = ['#77AADD', '#EE8866', '#EEDD88', '#FFAABB', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#DDDDDD'];

const color = (key: string, i: number): TokenHighlight => ({
	key,
	color: colors[i % colors.length],
	textcolor: 'black',
	textcolorcontrast: 'white',
});

function mapCaptureList(key: string, list: BLMatchInfoList): HighlightSection[] {
	return list.infos.map<HighlightSection>((info: UnionHelpers.Merge<BLMatchInfoList['infos'][number]>, index) => ({
		...info,
		isRelation: info.type === 'relation',
		showHighlight: true,
		sourceEnd: info.sourceEnd ?? -1,
		sourceStart: info.sourceStart ?? -1,
		targetEnd: info.targetEnd ?? -1,
		targetStart: info.targetStart ?? -1,
		key: `${key}[${index}]`,
		display: info.relType || info.tagName || '[unknown]',
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
 */
export function getHighlightSections(matchInfos: NonNullable<BLHit['matchInfos']>): HighlightSection[] {
	let interestingCaptures = Object.entries(matchInfos)
		.flatMap<HighlightSection>(([key, info]) => {
			if (key === 'captured_rels') return [];

			if (info.type === 'list') return mapCaptureList(key, info);
			else if (info.type === 'relation') return mapCaptureRelation(key, info);
			else if (info.type === 'span') return mapCaptureSpan(key, info);
			else return [];
		})
		.sort((a, b) => a.key.localeCompare(b.key));

	const hasExplicitCaptures = interestingCaptures.some(c => !c.isRelation);

	const result: HighlightSection[] = interestingCaptures
		.map(mi => {
			const shouldHighlightByDefault = !mi.isRelation || !hasExplicitCaptures;
			const shouldHighlightByCustomizations = corpusCustomizations.results.matchInfoHighlightStyle(mi);

			if (shouldHighlightByCustomizations === 'none') {
				return null;
			} else if (shouldHighlightByCustomizations === 'static') {
				mi.showHighlight = true;
			} else if (shouldHighlightByCustomizations === 'hover') {
				mi.showHighlight = false;
			} else {
				mi.showHighlight = shouldHighlightByDefault;
			}

			return mi;
		})
		.filter(mi => mi !== null);

	return result;
}

/** Return those entries in the highlights array where source/target overlaps with the globalTokenIndex */
export function findHighlightsByTokenIndex(highlights: HighlightSection[], globalTokenIndex: number, colorsBySectionKey: Record<string, TokenHighlight>): undefined | CaptureAndRelation[] {
	const matches: CaptureAndRelation[] = [];
	for (const c of highlights) {
		const isCrossFieldRelation = 'targetField' in c;
		const areWeTarget = !isCrossFieldRelation || c.targetField === '__THIS__';
		const areWeSource = !isCrossFieldRelation || !areWeTarget;

		const isSource = areWeSource && c.sourceStart <= globalTokenIndex && globalTokenIndex < c.sourceEnd;
		const isTarget = areWeTarget && c.targetStart <= globalTokenIndex && globalTokenIndex < c.targetEnd;
		if (isSource || isTarget) {
			const colorIndex = c.key.replace(/\[\d+\]$/g, '');
			const FALLBACK_COLOR = { color: 'black', textcolor: 'white', textcolorcontrast: 'black' };

			matches.push({
				key: c.key,
				display: c.isRelation ? (isSource ? c.display + '-->' : '-->' + c.display) : c.display,
				highlight: colorsBySectionKey[colorIndex] || FALLBACK_COLOR,
				showHighlight: c.showHighlight,
				isSource: c.isRelation && isSource,
				isTarget: c.isRelation && isTarget,
			});
		}
	}
	return matches.length ? matches : undefined;
}

/**
 * For hits with parallel information (e.g. hit in english with dutch alignments from other fields).
 * Enrich the hit in the target with match/relation info.
 */
export function mergeMatchInfos(data: BLHitResults): BLHitResults {
	data.hits.forEach(hit => {
		if (!hit.matchInfos || !hit.otherFields || Object.keys(hit.matchInfos).length === 0) return;
		hit.otherFields = Object.fromEntries(Object.entries(hit.otherFields).map(([k, v]: [string, BLHitInOtherField]) => [k, processHit(k, v, hit.matchInfos!)]));
	});

	function processHit(targetFieldName: string, targetHit: BLHitInOtherField, sourceHitMatchInfos: Record<string, BLMatchInfo>): BLHitInOtherField {
		if (Object.keys(sourceHitMatchInfos).length === 0) return targetHit;

		function matchInfoHasUsAsTargets([_name, matchInfo]: [string, BLMatchInfo]): boolean {
			if ('targetField' in matchInfo && matchInfo.targetField === targetFieldName) return true;
			if (matchInfo.type === 'list') {
				const infos = matchInfo.infos as BLMatchInfo[];
				if (infos.some(l => 'targetField' in l && l.targetField === targetFieldName)) return true;
			}
			return false;
		}

		function markTargetField(matchInfo: BLMatchInfo) {
			return 'targetField' in matchInfo ? { ...matchInfo, targetField: '__THIS__' } : matchInfo;
		}

		const toMerge = Object.entries(sourceHitMatchInfos)
			.filter(matchInfoHasUsAsTargets)
			.reduce(
				(acc, [name, matchInfo]) => {
					if ('infos' in matchInfo) {
						acc[name] = {
							...matchInfo,
							infos: matchInfo.infos.map(markTargetField) as BLMatchInfoRelation[],
						};
					} else {
						acc[name] = markTargetField(matchInfo);
					}
					return acc;
				},
				{} as Record<string, BLMatchInfo>,
			);

		if (!targetHit.matchInfos || Object.keys(targetHit.matchInfos).length === 0) {
			return {
				...targetHit,
				matchInfos: toMerge,
			};
		}

		const newHit = { ...targetHit };
		newHit.matchInfos = { ...toMerge, ...targetHit.matchInfos };
		return newHit;
	}
	return data;
}

/**
 * Get a color for every relation and capture.
 * This ensures that we use the same color everywhere for the same relation/capture.
 */
export function getHighlightColors(summary: BLSearchSummaryPattern): Record<string, TokenHighlight> {
	return Object.fromEntries(
		Object.keys(summary.pattern?.matchInfos ?? {})
			.sort()
			.map((key, i) => [key, color(key, i)]),
	);
}
