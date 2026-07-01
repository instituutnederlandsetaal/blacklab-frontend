import {
	isHitResults,
	isHitResultsV4,
	type BLDoc,
	type BLDocGroupResults,
	type BLDocGroupResultsV4,
	type BLDocInfo,
	type BLDocInfoV4,
	type BLDocResults,
	type BLDocResultsV4,
	type BLDocument,
	type BLDocumentV4,
	type BLHit,
	type BLHitGroupResults,
	type BLHitGroupResultsV4,
	type BLHitInOtherField,
	type BLHitResults,
	type BLHitResultsV4,
	type BLHitSnippetPart,
	type BLHitV4,
	type BLSearchResult,
	type BLSearchResultV4,
	type BLSearchResultsSample,
	type BLSearchResultsStatsV5,
	type BLSearchSummary,
	type BLSearchSummaryGroupedV4,
	type BLSearchSummaryPatternV4,
	type BLSearchSummaryV4,
	type BLSubcorpusSize
} from '@/types/blacklabtypes';

function emptySnippetPartFrom(match: BLHitSnippetPart): BLHitSnippetPart {
	const part = Object.entries(match).reduce((acc, [key]) => {
		acc[key] = [];
		return acc;
	}, {} as BLHitSnippetPart);
	part.punct ??= [];
	return part;
}

function normalizeHitLike<T extends BLHit | BLHitV4 | BLHitInOtherField>(hit: T): BLHit {
	const raw = hit as BLHit & BLHitV4;
	const before = raw.before ?? raw.left ?? emptySnippetPartFrom(raw.match);
	const after = raw.after ?? raw.right ?? emptySnippetPartFrom(raw.match);
	const otherFields = raw.otherFields ? Object.fromEntries(Object.entries(raw.otherFields).map(([field, fieldHit]) => [field, normalizeHitInOtherField(fieldHit)])) : undefined;
	const { left: _left, right: _right, ...rest } = raw;
	return {
		...rest,
		before,
		after,
		otherFields,
	};
}

function normalizeHitInOtherField(hit: BLHitInOtherField): BLHitInOtherField {
	const normalized = normalizeHitLike(hit);
	const { docPid: _docPid, otherFields: _otherFields, ...rest } = normalized;
	return rest;
}

export function normalizeHit(hit: BLHit | BLHitV4): BLHit {
	return normalizeHitLike(hit);
}

function isDocInfoV5(docInfo: BLDocInfo | BLDocInfoV4): docInfo is BLDocInfo {
	const metadata = (docInfo as BLDocInfo).metadata;
	return metadata != null && typeof metadata === 'object' && !Array.isArray(metadata);
}

export function normalizeDocInfo(docInfo: BLDocInfo | BLDocInfoV4): BLDocInfo {
	if (isDocInfoV5(docInfo)) return docInfo;

	const { lengthInTokens, tokenCounts, mayView, ...metadata } = docInfo;
	return {
		metadata: Object.fromEntries(
			Object.entries(metadata).map(([field, value]) => {
				if (Array.isArray(value)) return [field, value.map(String)];
				return [field, [String(value)]];
			}),
		),
		tokenCounts: tokenCounts ?? [{ fieldName: '', tokenCount: lengthInTokens }],
		mayView,
	};
}

function normalizeDoc(doc: BLDoc | BLDocResultsV4['docs'][number]): BLDoc {
	return {
		...doc,
		docInfo: normalizeDocInfo(doc.docInfo as BLDocInfo | BLDocInfoV4),
	};
}

export function normalizeDocument(document: BLDocument | BLDocumentV4): BLDocument {
	return {
		...document,
		docInfo: normalizeDocInfo(document.docInfo),
	};
}

function normalizeSample(summary: BLSearchSummaryV4): BLSearchSummary['results']['sample'] {
	const sample = summary as BLSearchResultsSample;
	if ('sampleSize' in sample) return { sample: sample.sampleSize, seed: sample.sampleSeed };
	if ('samplePercentage' in sample) return { percentage: sample.samplePercentage, seed: sample.sampleSeed };
	return undefined;
}

function normalizeStats(status: BLSearchResultsStatsV5['status'], hits: number, documents: number, timeMs: number, stoppedBecauseTooMany: boolean): BLSearchResultsStatsV5 {
	return {
		status,
		hits,
		documents,
		timeMs,
		stoppedBecauseTooMany,
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

export function normalizeSearchSummary(summary: BLSearchSummary | (BLSearchSummaryV4 & Partial<BLSearchSummaryPatternV4> & Partial<BLSearchSummaryGroupedV4>)): BLSearchSummary {
	if ('params' in summary) return summary;

	const hasPattern = 'pattern' in summary;
	const hasGroups = 'numberOfGroups' in summary;
	const status = summary.stillCounting ? 'working' : 'finished';
	return {
		params: summary.searchParam,
		pattern: hasPattern ? summary.pattern : undefined,
		results: {
			window: {
				firstResult: summary.windowFirstResult,
				requestedSize: summary.requestedWindowSize,
				actualSize: summary.actualWindowSize,
				hasPrevious: summary.windowHasPrevious,
				hasNext: summary.windowHasNext,
			},
			stats: {
				processed: normalizeStats(
					status,
					hasPattern ? (summary.numberOfHitsRetrieved ?? 0) : 0,
					summary.numberOfDocsRetrieved,
					summary.searchTime,
					hasPattern ? !!summary.stoppedRetrievingHits : false,
				),
				counted: normalizeStats(
					status,
					hasPattern ? (summary.numberOfHits ?? 0) : 0,
					summary.numberOfDocs,
					summary.countTime ?? summary.searchTime,
					hasPattern ? !!summary.stoppedCountingHits : false,
				),
				numberOfGroups: hasGroups ? summary.numberOfGroups : undefined,
				largestGroupSize: hasGroups ? summary.largestGroupSize : undefined,
				subcorpusSize: getSummarySubcorpusSize(summary),
			},
			sample: normalizeSample(summary),
		},
	} as BLSearchSummary;
}

export function normalizeHitResponse(results: BLHitResults | BLHitGroupResults | BLHitResultsV4 | BLHitGroupResultsV4): BLHitResults | BLHitGroupResults {
	if (isHitResults(results)) {
		return {
			...results,
			hits: results.hits.map(normalizeHit),
			summary: normalizeSearchSummary(results.summary) as BLHitResults['summary'],
		};
	}
	if (isHitResultsV4(results)) {
		return {
			docInfo: Object.fromEntries(Object.entries(results.docInfos).map(([pid, docInfo]) => [pid, normalizeDocInfo(docInfo)])),
			hits: results.hits.map(normalizeHit),
			summary: normalizeSearchSummary(results.summary) as BLHitResults['summary'],
		};
	}
	return {
		...results,
		summary: normalizeSearchSummary(results.summary) as BLHitGroupResults['summary'],
	};
}

export function normalizeDocResponse(results: BLDocResults | BLDocGroupResults | BLDocResultsV4 | BLDocGroupResultsV4): BLDocResults | BLDocGroupResults {
	if ('docs' in results) {
		return {
			...results,
			docs: results.docs.map(normalizeDoc),
			summary: normalizeSearchSummary(results.summary) as BLDocResults['summary'],
		};
	}
	return {
		...results,
		summary: normalizeSearchSummary(results.summary) as BLDocGroupResults['summary'],
	};
}

export function normalizeSearchResult(results: BLSearchResult | BLSearchResultV4): BLSearchResult {
	if ('hits' in results || 'hitGroups' in results) return normalizeHitResponse(results);
	return normalizeDocResponse(results);
}
