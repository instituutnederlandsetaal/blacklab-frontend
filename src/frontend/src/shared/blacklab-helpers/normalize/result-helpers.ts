import {
	isGroups,
	isHitGroups,
	isHitResults,
	type BLDocInfo,
	type BLSearchParameters,
	type BLSearchResult,
	type BLSearchResultsStatsV5,
	type BLSearchSummary,
	type BLSearchSummaryWindowV5,
	type BLSubcorpusSize,
} from '@/types/blacklabtypes';

function summaryFrom(input: BLSearchResult | BLSearchSummary): BLSearchSummary {
	return 'summary' in input ? input.summary : input;
}

export function getSearchParameters(input: BLSearchResult | BLSearchSummary): BLSearchParameters {
	return summaryFrom(input).params;
}

export function getSearchWindow(input: BLSearchResult | BLSearchSummary): BLSearchSummaryWindowV5 {
	return summaryFrom(input).results.window;
}

export function getProcessedStats(input: BLSearchResult | BLSearchSummary): BLSearchResultsStatsV5 {
	return summaryFrom(input).results.stats.processed;
}

export function getCountedStats(input: BLSearchResult | BLSearchSummary): BLSearchResultsStatsV5 {
	return summaryFrom(input).results.stats.counted;
}

export function getNumberOfGroups(input: BLSearchResult | BLSearchSummary): number | undefined {
	return summaryFrom(input).results.stats.numberOfGroups;
}

export function getLargestGroupSize(input: BLSearchResult | BLSearchSummary): number | undefined {
	return summaryFrom(input).results.stats.largestGroupSize;
}

export function getSubcorpusSize(input: BLSearchResult | BLSearchSummary): BLSubcorpusSize | undefined {
	return summaryFrom(input).results.stats.subcorpusSize;
}

export function getAnnotatedFieldSubcorpusSize(input: BLSearchResult | BLSearchSummary, annotatedFieldId: string): Pick<BLSubcorpusSize, 'documents' | 'tokens'> | null {
	const subcorpusSize = getSubcorpusSize(input);
	if (!subcorpusSize) return null;
	const annotatedField = subcorpusSize.annotatedFields?.find(field => field.fieldName === annotatedFieldId);
	if (annotatedField) {
		return {
			documents: annotatedField.documents,
			tokens: annotatedField.tokens,
		};
	}
	return {
		documents: subcorpusSize.documents,
		tokens: subcorpusSize.tokens,
	};
}

export function getTotalResults(input: BLSearchResult): number {
	if (isGroups(input)) return getNumberOfGroups(input) ?? 0;
	if (isHitResults(input) || isHitGroups(input)) return getCountedStats(input).hits;
	return getCountedStats(input).documents;
}

export function getTotalAvailableResults(input: BLSearchResult): number {
	if (isGroups(input)) return getNumberOfGroups(input) ?? 0;
	if (isHitResults(input) || isHitGroups(input)) return getProcessedStats(input).hits;
	return getProcessedStats(input).documents;
}

export function getMatchingDocuments(input: BLSearchResult | BLSearchSummary): number {
	return getCountedStats(input).documents;
}

export function getMatchingHits(input: BLSearchResult | BLSearchSummary): number | undefined {
	return summaryFrom(input).pattern != null ? getCountedStats(input).hits : undefined;
}

export function getSearchTimeMs(input: BLSearchResult | BLSearchSummary): number {
	return getCountedStats(input).timeMs || getProcessedStats(input).timeMs || 0;
}

export function getSearchState(input: BLSearchResult | BLSearchSummary): 'counting' | 'finished' | 'limited' {
	const counted = getCountedStats(input);
	if (counted.status === 'working') return 'counting';
	if (counted.stoppedBecauseTooMany) return 'limited';
	return 'finished';
}

export function getDocumentLength(docInfo: BLDocInfo, fieldName?: string): number {
	return docInfo.tokenCounts.find(tokenCount => tokenCount.fieldName === fieldName)?.tokenCount ?? docInfo.tokenCounts[0]?.tokenCount ?? 0;
}
