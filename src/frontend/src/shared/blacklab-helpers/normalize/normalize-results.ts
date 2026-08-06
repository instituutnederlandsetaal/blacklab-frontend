import {
	type BLDoc,
	type BLDocGroupResults,
	type BLDocGroupResultsV4,
	type BLDocInfo,
	type BLDocInfoV4,
	type BLDocResults,
	type BLDocResultsV4,
	type BLDocResultsV5,
	type BLDocV4,
	type BLDocV5,
	type BLDocument,
	type BLDocumentV4,
	type BLHit,
	type BLHitGroupResults,
	type BLHitGroupResultsV4,
	type BLHitInDoc,
	type BLHitInDocV4,
	type BLHitInDocV5,
	type BLHitInOtherFieldV4,
	type BLHitInOtherFieldV5,
	type BLHitResults,
	type BLHitResultsV4,
	type BLHitResultsV5,
	type BLHitSnippetPart,
	type BLHitV4,
	type BLHitV5,
	type BLSearchResultsStatsV5,
	type BLSearchParameters,
	type BLSearchSummaryGroupedV4,
	type BLSearchSummaryPatternV4,
	type BLSearchSummaryV4,
	type BLSearchSummaryV5,
	type BLSearchSummaryWindowV5,
	type BLSubcorpusSize,
} from '@/types/blacklabtypes';

/** Create a snippetPart with the same annotations as the provided one - but all empty */
function emptySnippetPartFrom(match: BLHitSnippetPart): BLHitSnippetPart {
	const part: BLHitSnippetPart = { punct: [] };
	for (const key in match) {
		part[key] = [];
	}
	return part;
}

type AnyRawSnippet = {
	match: BLHitSnippetPart;
	left?: BLHitSnippetPart;
	right?: BLHitSnippetPart;
	before?: BLHitSnippetPart;
	after?: BLHitSnippetPart;
};

/** Summary shape returned by older BlackLab 5 responses. */
type BLSearchSummaryV5Legacy = {
	params: BLSearchParameters;
	resultWindow: BLSearchSummaryWindowV5;
	resultsStats: Pick<BLSearchResultsStatsV5, 'status' | 'hits' | 'documents' | 'timeMs'> & { subcorpusSize?: BLSubcorpusSize };
};

const getBefore = (hit: AnyRawSnippet): BLHitSnippetPart => {
	if ('left' in hit) return hit.left ?? emptySnippetPartFrom(hit.match);
	if ('before' in hit) return hit.before ?? emptySnippetPartFrom(hit.match);
	return emptySnippetPartFrom(hit.match);
};
const getAfter = (hit: AnyRawSnippet): BLHitSnippetPart => {
	if ('right' in hit) return hit.right ?? emptySnippetPartFrom(hit.match);
	if ('after' in hit) return hit.after ?? emptySnippetPartFrom(hit.match);
	return emptySnippetPartFrom(hit.match);
};

type RawOrNormalizedHitInDoc = BLHitInDocV4 | BLHitInDocV5 | BLHitInDoc;
type RawOrNormalizedHit = BLHitV4 | BLHitInOtherFieldV4 | BLHitV5 | BLHitInOtherFieldV5 | BLHit;

function normalizeHitInDoc(hit: RawOrNormalizedHitInDoc): BLHitInDoc {
	return {
		after: getAfter(hit),
		before: getBefore(hit),
		match: hit.match,
	};
}

export function normalizeHit(hit: RawOrNormalizedHit, docPid?: string): BLHit {
	return {
		...hit,
		after: getAfter(hit),
		before: getBefore(hit),
		docPid: 'docPid' in hit ? hit.docPid : docPid!,
		end: hit.end,
		match: hit.match,
		start: hit.start,
		matchInfos: 'matchInfos' in hit ? hit.matchInfos : undefined,
		otherFields: 'otherFields' in hit && hit.otherFields ? Object.fromEntries(Object.entries(hit.otherFields).map(([field, fieldHit]) => [field, normalizeHit(fieldHit, hit.docPid)])) : undefined,
	} satisfies BLHit;
}

function normalizeDocInfo(docInfo: BLDocInfoV4): BLDocInfo {
	const { lengthInTokens, tokenCounts, mayView, ...metadata } = docInfo;
	return {
		metadata: Object.entries(metadata as Record<string, string | string[]>).reduce<BLDocInfo['metadata']>((acc, [field, value]) => {
			if (Array.isArray(value)) acc[field] = value;
			else acc[field] = [String(value)];
			return acc;
		}, {}),
		tokenCounts: tokenCounts ?? [{ fieldName: '', tokenCount: lengthInTokens }],
		mayView,
	};
}

function normalizeDocInfoIfNeeded(docInfo: BLDocInfo | BLDocInfoV4): BLDocInfo {
	return (docInfo as Partial<BLDocInfo>).metadata != null ? (docInfo as BLDocInfo) : normalizeDocInfo(docInfo as BLDocInfoV4);
}

export function normalizeDoc(doc: BLDocumentV4): BLDocument;
export function normalizeDoc(doc: BLDocV4): BLDoc;
export function normalizeDoc(doc: BLDocV5): BLDoc;
export function normalizeDoc(doc: BLDocV4 | BLDocV5 | BLDocumentV4): BLDoc | BLDocument {
	return {
		...doc,
		snippets: 'snippets' in doc ? doc.snippets?.map(normalizeHitInDoc) : undefined,
		docInfo: normalizeDocInfoIfNeeded(doc.docInfo),
	};
}

function getSummarySubcorpusSize(summary: BLSearchSummaryV4 & Partial<BLSearchSummaryPatternV4> & Partial<BLSearchSummaryGroupedV4>): BLSubcorpusSize | undefined {
	if (summary.subcorpusSize) return summary.subcorpusSize;
	if (summary.tokensInMatchingDocuments != null) {
		return {
			documents: summary.numberOfDocs,
			tokens: summary.tokensInMatchingDocuments,
		};
	}
	return undefined;
}

function normalizeSearchSummary(summary: BLSearchSummaryV4 & Partial<BLSearchSummaryPatternV4> & Partial<BLSearchSummaryGroupedV4>): BLSearchSummaryV5 {
	const status = summary.stillCounting ? 'working' : 'finished';
	const r: BLSearchSummaryV5 = {
		params: summary.searchParam,
		pattern: summary.pattern,
		results: {
			window: {
				firstResult: summary.windowFirstResult,
				requestedSize: summary.requestedWindowSize,
				actualSize: summary.actualWindowSize,
				hasPrevious: summary.windowHasPrevious,
				hasNext: summary.windowHasNext,
			},
			stats: {
				processed: {
					status,
					documents: summary.numberOfDocsRetrieved,
					hits: summary.numberOfHitsRetrieved,
					stoppedBecauseTooMany: !!summary.stoppedRetrievingHits,
					timeMs: summary.searchTime,
				} satisfies BLSearchResultsStatsV5,
				counted: {
					status,
					documents: summary.numberOfDocs,
					hits: summary.numberOfHits,
					stoppedBecauseTooMany: !!summary.stoppedCountingHits,
					timeMs: summary.countTime ?? summary.searchTime,
				} satisfies BLSearchResultsStatsV5,
				numberOfGroups: summary.numberOfGroups!,
				largestGroupSize: summary.largestGroupSize!,
				subcorpusSize: getSummarySubcorpusSize(summary),
			},
			sample:
				'sampleSeed' in summary
					? 'samplePercentage' in summary
						? {
								percentage: summary.samplePercentage,
								seed: summary.sampleSeed,
							}
						: {
								sample: summary.sampleSize,
								seed: summary.sampleSeed,
							}
					: { percentage: undefined, seed: undefined, sample: undefined },
		},
	};
	return r;
}

type NormalizableSummary = BLSearchSummaryV5 | BLSearchSummaryV5Legacy | (BLSearchSummaryV4 & Partial<BLSearchSummaryPatternV4> & Partial<BLSearchSummaryGroupedV4>);

function normalizeSummary(summary: NormalizableSummary): BLSearchSummaryV5 {
	if ('results' in summary) return summary;
	if ('resultsStats' in summary)
		return {
			params: summary.params,
			results: {
				window: summary.resultWindow,
				stats: {
					processed: { ...summary.resultsStats, stoppedBecauseTooMany: false },
					counted: { ...summary.resultsStats, stoppedBecauseTooMany: false },
					subcorpusSize: summary.resultsStats.subcorpusSize,
					numberOfGroups: undefined,
					largestGroupSize: undefined,
				},
				sample: { percentage: undefined, seed: undefined, sample: undefined },
			},
		};
	return normalizeSearchSummary(summary);
}

export function normalizeHitResponse(results: BLHitResultsV4): BLHitResults;
export function normalizeHitResponse(results: BLHitResultsV5): BLHitResults;
export function normalizeHitResponse(results: BLHitGroupResultsV4): BLHitGroupResults;
export function normalizeHitResponse(results: BLHitGroupResults): BLHitGroupResults;
export function normalizeHitResponse(results: BLHitResultsV4 | BLHitResultsV5 | BLHitGroupResultsV4 | BLHitGroupResults): BLHitResults | BLHitGroupResults;
export function normalizeHitResponse(results: BLHitResultsV4 | BLHitResultsV5 | BLHitGroupResultsV4 | BLHitGroupResults): BLHitResults | BLHitGroupResults {
	if ('hits' in results)
		return {
			docInfos: Object.fromEntries(Object.entries(results.docInfos).map(([pid, docInfo]) => [pid, normalizeDocInfoIfNeeded(docInfo)])),
			hits: results.hits.map(h => normalizeHit(h) as BLHitResults['hits'][number]),
			summary: normalizeSummary(results.summary),
		} satisfies BLHitResults;
	else if ('hitGroups' in results)
		return {
			hitGroups: results.hitGroups,
			summary: normalizeSummary(results.summary),
		} satisfies BLHitGroupResults;

	throw new Error('Invalid results type for normalization, does not seem to be hits or hit groups', results);
}

export function normalizeDocResponse(results: BLDocResultsV4): BLDocResults;
export function normalizeDocResponse(results: BLDocResultsV5): BLDocResults;
export function normalizeDocResponse(results: BLDocGroupResultsV4): BLDocGroupResults;
export function normalizeDocResponse(results: BLDocGroupResults): BLDocGroupResults;
export function normalizeDocResponse(results: BLDocResultsV4 | BLDocResultsV5 | BLDocGroupResultsV4 | BLDocGroupResults): BLDocResults | BLDocGroupResults;
export function normalizeDocResponse(results: BLDocResultsV4 | BLDocResultsV5 | BLDocGroupResultsV4 | BLDocGroupResults): BLDocResults | BLDocGroupResults {
	if ('docGroups' in results)
		return {
			docGroups: results.docGroups,
			summary: normalizeSummary(results.summary),
		} satisfies BLDocGroupResults;
	else if ('docs' in results)
		return {
			docs: results.docs.map(normalizeDoc),
			summary: normalizeSummary(results.summary),
		} satisfies BLDocResults;

	throw new Error('Invalid results type for normalization, does not seem to be docs or doc groups', results);
}
