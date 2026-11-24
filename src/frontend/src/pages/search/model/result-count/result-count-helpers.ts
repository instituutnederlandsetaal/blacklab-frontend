/**
 * Helpers for counting results, both from a query and from filters.
 * These do not include any API logic, just some common types and helper functions to extract the relevant information from the search results.
 * The actual API logic is implemented in result-count-from-query and result-count-from-filters.
 */

import type { NormalizedIndex } from '@/types/apptypes';
import { type BLSearchResult } from '@/types/blacklabtypes';

import type { SubcorpusOutput } from './result-count-from-filters';

import { getAnnotatedFieldSubcorpusSize, getCountedStats, getNumberOfGroups, getProcessedStats, getSearchState, getSearchTimeMs } from '@/shared/blacklab-helpers/normalize/result-helpers';

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

export function getCorpusTotals(index: NormalizedIndex, annotatedFieldId: string): SubcorpusOutput {
	return {
		numberOfMatchingDocuments: index.annotatedFields[annotatedFieldId].documentCount ?? index.documentCount,
		tokensInMatchingDocuments: index.annotatedFields[annotatedFieldId].tokenCount ?? index.tokenCount,
		totalDocsInIndex: index.documentCount,
		totalTokensInIndex: index.tokenCount,
	};
}

export function getTotals(r: BLSearchResult, annotatedFieldId: string): TotalsOutput {
	const fieldSubcorpusSize = annotatedFieldId ? getAnnotatedFieldSubcorpusSize(r.summary, annotatedFieldId) : null;
	const processed = getProcessedStats(r);
	const counted = getCountedStats(r);

	return {
		results: r,
		docsRetrieved: processed.documents,
		docsCounted: counted.documents,
		hitsRetrieved: processed.hits ?? 0,
		hitsCounted: counted.hits ?? 0,
		groups: getNumberOfGroups(r),
		searchTime: getSearchTimeMs(r),
		tokensInMatchingDocuments: fieldSubcorpusSize?.tokens ?? 0,
		numberOfMatchingDocuments: fieldSubcorpusSize?.documents ?? counted.documents,
		state: getSearchState(r),
	};
}
