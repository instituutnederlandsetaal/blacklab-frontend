import URI from 'urijs';

import { searchFormIds } from '@/customization-api/shared/form/ids';
import type { HistoryUrlDetails } from '@/features/history/model/query-history-state';
import { LegacyFormRestorer, type LegacyFormDependencies } from '@/features/search/model/form/restore-legacy-form';
import { summarizeLegacySearch } from '@/features/search/model/search-summary';
import { queryString } from '@/url/query';
import { readSearchQuery } from '@/url/search-query';

/** Reconstruct display summaries when importing a URL without a saved summary. */
export async function queryHistoryFromUrl(url: string, dependencies: LegacyFormDependencies) {
	const uri = new URI(url);
	const query = uri.query(true);
	const { submitted, results } = readSearchQuery(query);
	const { viewedResults } = queryHistoryDetails(url);
	const entry = await new LegacyFormRestorer(dependencies, {
		submitted,
		viewedResults,
		groupBy: submitted.params.colltype ? [] : (results.group?.split(',') ?? []),
		groupDisplayMode: results.groupDisplayMode,
	}).get();
	const summary = summarizeLegacySearch(entry, queryString(uri.query(true), 'patt') ?? undefined, dependencies.corpus.allAnnotationsMap);
	return {
		url,
		displayValues: {
			pattern: summary.pattern || '',
			filters: summary.filter || '',
		},
	};
}

/** Decode history metadata and identity together; result controls do not define a new query. */
export function queryHistoryDetails(url: string): HistoryUrlDetails {
	const uri = new URI(url);
	const query = uri.query(true);
	const paths = uri.segmentCoded().filter(Boolean);
	const viewedResults = paths.at(-2) === 'search' ? paths.at(-1) : null;
	const formId = queryString(query, 'f.form');
	let exportResults = (['corpora', 'frequency', 'ngram'] as const).find(mode => searchFormIds.exploreForm(mode) === formId) ?? viewedResults;
	try {
		const ui = JSON.parse(queryString(query, 'interface') ?? 'null');
		if (!formId && ui?.form === 'explore' && typeof ui.exploreMode === 'string') exportResults = ui.exploreMode;
	} catch {
		/* Older links may contain malformed interface state. */
	}
	const { submitted, results } = readSearchQuery(query);
	const form = submitted.params;
	return {
		viewedResults: viewedResults ?? null,
		collocation: !!form.colltype,
		groupBy: results.group?.split(',') ?? [],
		pattern: form.patt,
		filters: form.filter,
		exportResults: exportResults ?? null,
		hasGapValues: !!form.pattgapdata,
		identity: {
			form,
			encoded: Object.fromEntries(Object.entries(query).filter(([key]) => key.startsWith('f.'))),
			gap: form.pattgapdata,
			groupBy: results.group?.split(',').sort() ?? [],
		},
	};
}
