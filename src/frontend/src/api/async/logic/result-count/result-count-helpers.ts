/**
 * Helpers for counting results, both from a query and from filters.
 * These do not include any API logic, just some common types and helper functions to extract the relevant information from the search results.
 * The actual API logic is implemented in result-count-from-query and result-count-from-filters.
 */

import type { NormalizedIndex } from "@/types/apptypes";
import { hasGroupInfo, hasPatternInfo, type BLSearchResult, type BLSearchSummary } from "@/types/blacklabtypes";
import type { SubcorpusOutput } from "./result-count-from-filters";

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
	state: 'counting'|'finished'|'limited'|'paused';
}

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
};

export function getCorpusTotals(index: NormalizedIndex, annotatedFieldId: string): SubcorpusOutput {
	return {
		numberOfMatchingDocuments: index.annotatedFields[annotatedFieldId].documentCount || index.documentCount,
		tokensInMatchingDocuments: index.annotatedFields[annotatedFieldId].tokenCount || index.tokenCount,
		totalDocsInIndex: index.documentCount,
		totalTokensInIndex: index.tokenCount
	};
}

export function getTotals(r: BLSearchResult, annotatedFieldId: string): TotalsOutput {
	const hasPatternInfo_ = hasPatternInfo(r);
	const hasGroupInfo_ = hasGroupInfo(r);
	const fieldSubcorpusSize = annotatedFieldId ? getAnnotatedFieldSubcorpusSize(r.summary, annotatedFieldId) : null;

	return {
		results: r,
		docsRetrieved: r.summary.numberOfDocsRetrieved,
		docsCounted: r.summary.numberOfDocs,
		hitsRetrieved: hasPatternInfo_ ? r.summary.numberOfHitsRetrieved : 0,
		hitsCounted: hasPatternInfo_ ? r.summary.numberOfHits : 0,
		groups: hasGroupInfo_ ? r.summary.numberOfGroups : undefined,
		searchTime: r.summary.searchTime,
		tokensInMatchingDocuments: fieldSubcorpusSize?.tokens ?? r.summary.tokensInMatchingDocuments ?? 0,
		numberOfMatchingDocuments: fieldSubcorpusSize?.documents ?? r.summary.numberOfDocs ?? 0,
		state: r.summary.stillCounting ? 'counting' : (hasPatternInfo_ && r.summary.stoppedCountingHits) ? 'limited' : 'finished'
	};
}

export function getAnnotatedFieldSubcorpusSize(summary: BLSearchSummary|BLSearchResult['summary'], annotatedFieldId: string) {
	const subcorpusSize = (summary as SummaryWithAnnotatedFieldSubcorpus).subcorpusSize;
	if (!subcorpusSize) return null;
	const annotatedField = subcorpusSize.annotatedFields?.find((field) => field.fieldName === annotatedFieldId);
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
