import URI from 'urijs';

import { searchFormIds } from '@/customization-api/shared/form/ids';
import { queryString } from '@/url/query';
import { readGroupBy, readSubmittedSearch } from '@/url/search-query';

export type HistoryUrlDetails = {
	identity: unknown;
	viewedResults: string | null;
	collocation: boolean;
	groupBy: string[];
	pattern?: string;
	filters?: string;
	exportResults: string | null;
	hasGapValues: boolean;
};

function exportView(query: Record<string, unknown>, viewedResults: string | null) {
	const formId = queryString(query, 'f.form');
	const exportResults = (['corpora', 'frequency', 'ngram'] as const).find(mode => searchFormIds.exploreForm(mode) === formId) ?? viewedResults;
	try {
		const ui = JSON.parse(queryString(query, 'interface') ?? 'null');
		if (!formId && ui?.form === 'explore' && typeof ui.exploreMode === 'string') return ui.exploreMode as string;
	} catch {
		/* Older links may contain malformed interface state. */
	}
	return exportResults;
}

/** Decode history metadata and identity together; result controls do not define a new query. */
export function queryHistoryDetails(url: string): HistoryUrlDetails {
	const uri = new URI(url);
	const query = uri.query(true);
	const paths = uri.segmentCoded().filter(Boolean);
	const viewedResults = paths.at(-2) === 'search' ? (paths.at(-1) ?? null) : null;
	const submitted = readSubmittedSearch(query);
	const { params, form } = submitted;
	const groupBy = params.colltype ? [] : readGroupBy(query);
	return {
		viewedResults,
		collocation: !!params.colltype,
		groupBy,
		pattern: params.patt,
		filters: params.filter,
		get exportResults() {
			return exportView(query, viewedResults);
		},
		hasGapValues: !!params.pattgapdata,
		identity: {
			params,
			form,
			groupBy: [...groupBy].sort(),
		},
	};
}
