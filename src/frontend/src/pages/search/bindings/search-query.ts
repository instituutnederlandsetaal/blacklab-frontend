import type { LocationQuery, LocationQueryRaw } from 'vue-router';

import { queryNumber, queryString } from '@/app/router/url/query';
import { COLLOCATION_STRING_PARAMS } from '@/features/form/model/types/blacklab-params';
import type { ResultSettings, SharedResultSettings, ResultViewState } from '@/pages/search/model/results/results-state';
import { samplingParameters } from '@/pages/search/model/results/search-parameters';
import type { SubmittedQuery, SubmittedSearch } from '@/pages/search/model/submitted-search';
import { isBLCollocationType } from '@/types/blacklabtypes';
import { groupDisplayModes } from '@/types/group-display-mode';

import { cleanQueryParams } from '@/shared/api/lib/api-utils';

function parseCollocationContext(value: string): number | string | null {
	const parts = value.trim().split(':');
	if (parts.length > 2 || parts.some(part => !/^\d+$/.test(part))) return null;
	const context = parts.map(Number);
	if (!context.every(Number.isSafeInteger)) return null;
	return context.length === 1 ? context[0] : context.join(':');
}

export function readSubmittedSearch(query: Partial<LocationQuery>) {
	const params: SubmittedQuery = {};
	for (const key of [...COLLOCATION_STRING_PARAMS, 'pattgapdata'] as const) {
		const value = queryString(query, key);
		if (value !== null) params[key] = value;
	}
	for (const key of ['withspans', 'sensitive'] as const) {
		const value = queryString(query, key);
		if (value === 'true' || value === 'false') params[key] = value === 'true';
	}
	const colltype = queryString(query, 'colltype');
	if (isBLCollocationType(colltype)) {
		params.colltype = colltype;
		const context = queryString(query, 'context');
		if (context !== null) params.context = parseCollocationContext(context);
	}
	const form: LocationQuery = {};
	for (const [key, value] of Object.entries(query)) {
		if (key.startsWith('f.') && value !== undefined) form[key] = value;
	}
	return { params, form, legacyInterface: queryString(query, 'interface') ?? undefined } satisfies SubmittedSearch;
}

export function readGroupBy(query: Partial<LocationQuery>) {
	return (
		queryString(query, 'group')
			?.split(',')
			.map(value => value.trim())
			.filter(Boolean) ?? []
	);
}

const searchQueryKeys = new Set([
	...COLLOCATION_STRING_PARAMS,
	'query',
	'searchField',
	'field',
	'interface',
	'colltype',
	'sensitive',
	'withspans',
	'pattgapdata',
	'group',
	'groupDisplayMode',
	'resultViewCustomState',
	'sort',
	'viewgroup',
	'scorertype',
	'first',
	'number',
	'context',
	'sample',
	'samplenum',
	'sampleseed',
]);

export function readSearchQuery(query: Partial<LocationQuery>, pageSize: number) {
	const submitted = readSubmittedSearch(query);
	const collocations = !!submitted.params.colltype;
	const integer = (key: string, min = 0) => {
		const value = queryNumber(query, key);
		return value !== null && Number.isSafeInteger(value) && value >= min ? value : null;
	};
	const groupBy = collocations ? [] : readGroupBy(query);
	const viewGroup = groupBy.length || collocations ? queryString(query, 'viewgroup') : null;
	let customState: unknown = null;
	try {
		customState = JSON.parse(queryString(query, 'resultViewCustomState') ?? 'null');
	} catch {
		// Invalid custom display state must not prevent restoring the query.
	}
	const displayMode = queryString(query, 'groupDisplayMode');
	const first = integer('first') ?? 0;
	const size = integer('number', 1) ?? pageSize;
	// Leave room for the API request to round the selection up to a complete page.
	const lastPageEnd = Math.floor(Number.MAX_SAFE_INTEGER / pageSize) * pageSize;
	const validRange = first <= lastPageEnd - size;
	const view: ResultViewState = {
		customState,
		groupBy,
		collocationScorer: collocations ? (queryString(query, 'scorertype') ?? 'coll-dice') : 'coll-dice',
		sort: queryString(query, 'sort') ?? (collocations && !viewGroup ? 'score' : null),
		viewGroup,
		groupDisplayMode: groupDisplayModes.find(mode => mode === displayMode) ?? null,
		first: validRange ? first : 0,
		number: validRange ? size : pageSize,
	};
	const count = integer('samplenum');
	const percentage = queryNumber(query, 'sample');
	const global: SharedResultSettings = {
		sampleMode: count === null ? 'percentage' : 'count',
		sampleSize: count ?? (percentage !== null && percentage >= 0 && percentage <= 100 ? percentage : null),
		sampleSeed: integer('sampleseed', Number.MIN_SAFE_INTEGER),
		context: collocations ? null : integer('context'),
	};
	const extras = Object.fromEntries(Object.entries(query).filter(([key, value]) => value !== undefined && !searchQueryKeys.has(key) && !key.startsWith('f.')));
	return { submitted, view, global, extras };
}

/** Serialize application state using the selected view's stored selection. */
export function writeSearchQuery({
	submitted,
	global,
	view,
	extras = {},
}: {
	submitted: SubmittedSearch | undefined;
	global: ResultSettings;
	view: ResultViewState;
	extras?: LocationQueryRaw;
}): LocationQueryRaw {
	if (global.sampleSize != null && global.sampleSeed == null) throw new Error('Sampling requires a seed.');
	const params: Record<string, string> = {};
	for (const [key, value] of Object.entries(submitted?.params ?? {})) {
		if (value != null) params[key] = String(value);
	}
	const collocations = !!params.colltype;
	const controls = cleanQueryParams({
		...params,
		interface: submitted?.legacyInterface,
		first: view.first,
		number: view.number,
		group: collocations ? undefined : view.groupBy.join(','),
		sort: view.sort,
		viewgroup: view.viewGroup,
		context: collocations ? params.context : global.context,
		scorertype: collocations ? view.collocationScorer : undefined,
		...samplingParameters(global),
		resultViewCustomState: view.customState != null ? JSON.stringify(view.customState) : undefined,
		groupDisplayMode: view.groupDisplayMode,
	});
	const query: LocationQueryRaw = { ...extras, ...controls };
	for (const [key, value] of Object.entries(submitted?.form ?? {})) {
		query[key] = typeof value === 'string' || value === null ? value : [...value];
	}
	return query;
}
