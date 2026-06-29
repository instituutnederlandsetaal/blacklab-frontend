/**
 * Helpers for counting results, both from a query and from filters.
 * These do not include any API logic, just some common types and helper functions to extract the relevant information from the search results.
 * The actual API logic is implemented in result-count-from-query and result-count-from-filters.
 */

import type { NormalizedIndex } from '@/types/apptypes';
import { hasGroupInfo, hasPatternInfo, type BLSearchResult, type BLSearchSummary, type BLSearchSummaryGrouped, type BLSearchSummaryPattern } from '@/types/blacklabtypes';

import type { SubcorpusOutput } from './result-count-from-filters';

export type TotalsOutput = {
	results: BLSearchResult;
	docsRetrieved: number;
	docsCounted: number;
	hitsRetrieved: number;
	hitsCounted: number;
	groups?: number;
	searchTime: number;
	tokensInMatchingDocuments: number;
	numberOfMatchingDocuments: number;
	state: 'counting' | 'finished' | 'limited' | 'paused';
};

// TODO remove this type - can probably be captured directly in blacklab api response types.
type SummaryWithAnnotatedFieldSubcorpus = {
	subcorpusSize?: {
		documents: number;
		tokens: number;
		annotatedFields?: Array<{
			fieldName: string;
			documents: number;
			tokens: number;
		}>;
	};
	resultsStats?: {
		status?: 'counting' | 'finished' | 'limited' | 'paused';
		hits?: number;
		hitsRetrieved?: number;
		documents?: number;
		documentsRetrieved?: number;
		timeMs?: number;
		subcorpusSize?: {
			documents: number;
			tokens: number;
			annotatedFields?: Array<{
				fieldName: string;
				documents: number;
				tokens: number;
			}>;
		};
	};
};

type SearchSummaryWithResultStats = BLSearchSummary & Partial<BLSearchSummaryPattern> & Partial<BLSearchSummaryGrouped> & SummaryWithAnnotatedFieldSubcorpus;

export function getCorpusTotals(index: NormalizedIndex, annotatedFieldId: string): SubcorpusOutput {
	return {
		numberOfMatchingDocuments: index.annotatedFields[annotatedFieldId].documentCount || index.documentCount,
		tokensInMatchingDocuments: index.annotatedFields[annotatedFieldId].tokenCount || index.tokenCount,
		totalDocsInIndex: index.documentCount,
		totalTokensInIndex: index.tokenCount,
	};
}

export function getTotals(r: BLSearchResult, annotatedFieldId: string): TotalsOutput {
	const hasPatternInfo_ = hasPatternInfo(r);
	const hasGroupInfo_ = hasGroupInfo(r);
	const summary = r.summary as SearchSummaryWithResultStats;
	const fieldSubcorpusSize = annotatedFieldId ? getAnnotatedFieldSubcorpusSize(summary, annotatedFieldId) : null;
	const resultsStats = summary.resultsStats;

	return {
		results: r,
		docsRetrieved: summary.numberOfDocsRetrieved ?? resultsStats?.documentsRetrieved ?? 0,
		docsCounted: summary.numberOfDocs ?? resultsStats?.documents ?? 0,
		hitsRetrieved: hasPatternInfo_ ? (summary.numberOfHitsRetrieved ?? resultsStats?.hitsRetrieved ?? 0) : 0,
		hitsCounted: hasPatternInfo_ ? (summary.numberOfHits ?? resultsStats?.hits ?? 0) : 0,
		groups: hasGroupInfo_ ? summary.numberOfGroups : undefined,
		searchTime: summary.searchTime ?? (resultsStats?.timeMs != null ? resultsStats.timeMs / 1000 : 0),
		tokensInMatchingDocuments: fieldSubcorpusSize?.tokens ?? summary.tokensInMatchingDocuments ?? 0,
		numberOfMatchingDocuments: fieldSubcorpusSize?.documents ?? summary.numberOfDocs ?? resultsStats?.documents ?? 0,
		state: resultsStats?.status ?? (summary.stillCounting ? 'counting' : hasPatternInfo_ && summary.stoppedCountingHits ? 'limited' : 'finished'),
	};
}

export function getAnnotatedFieldSubcorpusSize(summary: BLSearchSummary | BLSearchResult['summary'], annotatedFieldId: string) {
	const summaryWithSubcorpus = summary as SummaryWithAnnotatedFieldSubcorpus;
	const subcorpusSize = summaryWithSubcorpus.subcorpusSize ?? summaryWithSubcorpus.resultsStats?.subcorpusSize;
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
