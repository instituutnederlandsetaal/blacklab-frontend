import { isGroups, isHitResults, type BLDocInfo, type BLSearchParameters, type BLSearchResult, type BLSearchResultsStatsV5, type BLSearchSummaryV5, type BLSubcorpusSize } from '@/types/blacklabtypes';

function summaryFrom(input: BLSearchResult | BLSearchSummaryV5): BLSearchSummaryV5 {
	return 'summary' in input ? input.summary : input;
}

export function getSearchParameters(input: BLSearchResult | BLSearchSummaryV5): BLSearchParameters {
	return summaryFrom(input).params;
}

export function getProcessedStats(input: BLSearchResult | BLSearchSummaryV5): BLSearchResultsStatsV5 {
	return summaryFrom(input).results.stats.processed;
}

export function getCountedStats(input: BLSearchResult | BLSearchSummaryV5): BLSearchResultsStatsV5 {
	return summaryFrom(input).results.stats.counted;
}

export function getNumberOfGroups(input: BLSearchResult | BLSearchSummaryV5): number | undefined {
	return summaryFrom(input).results.stats.numberOfGroups;
}

export function getLargestGroupSize(input: BLSearchResult | BLSearchSummaryV5): number | undefined {
	return summaryFrom(input).results.stats.largestGroupSize;
}

export function getSubcorpusSize(input: BLSearchResult | BLSearchSummaryV5): BLSubcorpusSize | undefined {
	return summaryFrom(input).results.stats.subcorpusSize;
}

export function getAnnotatedFieldSubcorpusSize(input: BLSearchResult | BLSearchSummaryV5, annotatedFieldId: string): Pick<BLSubcorpusSize, 'documents' | 'tokens'> | null {
	const found = getSubcorpusSize(input);
	const specific = found?.annotatedFields?.find(field => field.fieldName === annotatedFieldId) ?? found;
	return specific ? { documents: specific.documents, tokens: specific.tokens } : null;
}

export function getTotalAvailableResults(input: BLSearchResult): number {
	if (isGroups(input)) return getNumberOfGroups(input) ?? 0;
	if (isHitResults(input)) return getProcessedStats(input).hits!;
	return getProcessedStats(input).documents;
}

export function getMatchingDocuments(input: BLSearchResult | BLSearchSummaryV5): number {
	return getCountedStats(input).documents;
}

export function getMatchingHits(input: BLSearchResult | BLSearchSummaryV5): number | undefined {
	return summaryFrom(input).pattern != null ? getCountedStats(input).hits : undefined;
}

export function getSearchTimeMs(input: BLSearchResult | BLSearchSummaryV5): number {
	return getCountedStats(input).timeMs || getProcessedStats(input).timeMs || 0;
}

export function getSearchState(input: BLSearchResult | BLSearchSummaryV5): 'counting' | 'finished' | 'limited' {
	const counted = getCountedStats(input);
	if (counted.status === 'working') return 'counting';
	if (counted.stoppedBecauseTooMany) return 'limited';
	return 'finished';
}

export function getDocumentLength(docInfo: BLDocInfo, fieldName?: string): number {
	return docInfo.tokenCounts.find(tokenCount => tokenCount.fieldName === fieldName)?.tokenCount ?? docInfo.tokenCounts[0]?.tokenCount ?? 0;
}
