import type { LocationQueryRaw } from 'vue-router';

import { COLLOCATION_STRING_PARAMS } from '@/features/form/model/types/blacklab-params';
import type * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import type { GroupDisplayMode } from '@/features/search/model/results/result-types';
import type * as ViewStore from '@/features/search/model/results/view-state';
import type { SubmittedSearch } from '@/features/search/model/submitted-search';
import { isBLCollocationType } from '@/types/blacklabtypes';
import { queryNumber, queryString } from '@/url/query';

import { cleanQueryParams } from '@/shared/api/lib/api-utils';

function parseCollocationContext(value: string): number | string | null {
	const parts = value.trim().split(':');
	if ((parts.length !== 1 && parts.length !== 2) || parts.some(part => !/^\d+$/.test(part))) return null;
	const context = parts.map(Number);
	if (!context.every(value => Number.isSafeInteger(value) && value >= 0)) return null;
	return context.length === 1 ? context[0] : context.join(':');
}

function readLegacyInterface(query: Record<string, unknown>): SubmittedSearch['legacyInterface'] {
	try {
		const value = JSON.parse(queryString(query, 'interface') ?? 'null');
		if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
		const { form, patternMode, exploreMode, activeAnnotationTab, activeFilterTab } = value;
		return Object.fromEntries(Object.entries({ form, patternMode, exploreMode, activeAnnotationTab, activeFilterTab }).filter(([, value]) => value !== undefined));
	} catch {
		return undefined;
	}
}

/** Decode URL syntax into the submitted query, result controls, and extension parameters. */
export function readSearchQuery(query: Record<string, unknown>) {
	const params: SubmittedSearch['params'] = {};
	for (const key of COLLOCATION_STRING_PARAMS) {
		const value = queryString(query, key);
		if (value !== null) params[key] = value;
	}
	const withspans = queryString(query, 'withspans');
	if (withspans === 'true' || withspans === 'false') params.withspans = withspans === 'true';
	const colltype = queryString(query, 'colltype');
	if (isBLCollocationType(colltype)) {
		params.colltype = colltype;
		const context = queryString(query, 'context');
		if (context !== null) params.context = parseCollocationContext(context);
	}
	const sensitive = queryString(query, 'sensitive');
	if (sensitive === 'true' || sensitive === 'false') params.sensitive = sensitive === 'true';
	const pattgapdata = queryString(query, 'pattgapdata');
	if (pattgapdata !== null) params.pattgapdata = pattgapdata;
	const text = (key: string) => queryString(query, key) ?? undefined;
	const number = (key: string) => {
		const value = queryNumber(query, key);
		return value !== null && value >= 0 ? value : undefined;
	};
	const group =
		text('group')
			?.split(',')
			.map(value => value.trim())
			.filter(Boolean)
			.join(',') || undefined;
	const groupDisplayMode = queryString(query, 'groupDisplayMode') as GroupDisplayMode | null;
	let customState = null;
	try {
		customState = JSON.parse(queryString(query, 'resultViewCustomState') ?? 'null');
	} catch {
		// Invalid custom display state must not prevent restoring the query.
	}
	const samplenum = number('samplenum');
	const sample = number('sample');
	const results = {
		group,
		groupDisplayMode: groupDisplayMode && ['table', 'docs', 'hits', 'relative docs', 'relative hits', 'tokens'].includes(groupDisplayMode) ? groupDisplayMode : null,
		resultViewCustomState: customState,
		sort: text('sort'),
		viewgroup: group || params.colltype ? text('viewgroup') : undefined,
		scorertype: text('scorertype'),
		first: number('first'),
		number: number('number') || undefined,
		context: params.colltype ? undefined : number('context'),
		sample: samplenum === undefined && sample !== undefined && sample <= 100 ? sample : undefined,
		samplenum,
		sampleseed: queryNumber(query, 'sampleseed') ?? undefined,
	};
	const owned = new Set([
		...COLLOCATION_STRING_PARAMS,
		...Object.keys(results),
		'colltype',
		'sensitive',
		'withspans',
		'pattgapdata',
		'interface',
		'resultViewCustomState',
		'groupDisplayMode',
		'query',
		'searchField',
		'field',
	]);
	return {
		submitted: {
			params,
			form: Object.fromEntries(Object.entries(query).filter(([key]) => key.startsWith('f.'))) as SubmittedSearch['form'],
			legacyInterface: readLegacyInterface(query),
		} satisfies SubmittedSearch,
		results,
		extras: Object.fromEntries(Object.entries(query).filter(([key]) => !owned.has(key) && !key.startsWith('f.'))) as LocationQueryRaw,
	};
}

/** Decode result controls without loading a form or parsing BCQL. */
export function readSearchResultSettings(query: Record<string, unknown>, pageSize: number) {
	const { results, submitted } = readSearchQuery(query);
	const view: ViewStore.ViewRootState = {
		customState: results.resultViewCustomState,
		groupBy: submitted.params.colltype ? [] : (results.group?.split(',') ?? []),
		collocationScorer: submitted.params.colltype ? (results.scorertype ?? 'coll-dice') : 'coll-dice',
		sort: results.sort ?? (submitted.params.colltype && !results.viewgroup ? 'score' : null),
		viewGroup: results.viewgroup ?? null,
		groupDisplayMode: results.groupDisplayMode,
		first: results.first ?? 0,
		number: results.number ?? pageSize,
	};
	const global: GlobalResultsStore.ExternalModuleRootState = {
		sampleMode: results.samplenum !== undefined ? 'count' : 'percentage',
		sampleSeed: results.sampleseed ?? null,
		sampleSize: results.samplenum ?? results.sample ?? null,
		context: results.context ?? null,
	};
	return { view, global };
}

/** Serialize application state using the selected view's stored selection. */
export function createSearchPageQuery({
	submitted,
	global,
	view,
	extras = {},
}: {
	submitted: SubmittedSearch | undefined;
	global: GlobalResultsStore.ModuleRootState;
	view: ViewStore.ViewRootState;
	extras?: LocationQueryRaw;
}): LocationQueryRaw {
	if (global.sampleSize != null && global.sampleSeed == null) throw new Error('Sampling requires a seed.');
	const collocations = !!submitted?.params.colltype;
	return cleanQueryParams({
		...extras,
		...Object.fromEntries(Object.entries(submitted?.params ?? {}).map(([key, value]) => [key, value == null ? undefined : String(value)])),
		...submitted?.form,
		...(submitted?.legacyInterface ? { interface: JSON.stringify(submitted.legacyInterface) } : {}),
		first: view.first,
		number: view.number,
		group: collocations ? undefined : view.groupBy.join(','),
		sort: view.sort,
		viewgroup: view.viewGroup,
		context: collocations ? (submitted?.params.context == null ? undefined : String(submitted.params.context)) : global.context,
		scorertype: collocations ? view.collocationScorer : undefined,
		sample: global.sampleMode === 'percentage' && global.sampleSize != null ? global.sampleSize : undefined,
		samplenum: global.sampleMode === 'count' && global.sampleSize != null ? global.sampleSize : undefined,
		sampleseed: global.sampleSize != null ? global.sampleSeed : undefined,
		resultViewCustomState: view.customState != null ? JSON.stringify(view.customState) : undefined,
		groupDisplayMode: view.groupDisplayMode,
	});
}
