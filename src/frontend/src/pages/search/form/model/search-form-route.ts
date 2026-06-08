import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router';

import { FORM_QUERY_PREFIX, type CanonicalBlackLabFormParameters, type CompiledFormState, type ScopedFormQuery } from '@/features/form';

export const FORM_CANONICAL_QUERY_KEYS = {
	cql: 'patt',
	filter: 'filter',
	searchField: 'searchfield',
} as const;

export function isFormOwnedQueryKey(key: string): boolean {
	return key.startsWith(FORM_QUERY_PREFIX);
}

export function isCanonicalFormQueryKey(key: string): boolean {
	return Object.values(FORM_CANONICAL_QUERY_KEYS).includes(key as (typeof FORM_CANONICAL_QUERY_KEYS)[keyof typeof FORM_CANONICAL_QUERY_KEYS]);
}

function firstQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function readCanonicalFormQuery(query: LocationQuery): CanonicalBlackLabFormParameters {
	return {
		patt: firstQueryValue(query[FORM_CANONICAL_QUERY_KEYS.cql]),
		filter: firstQueryValue(query[FORM_CANONICAL_QUERY_KEYS.filter]),
		searchField: firstQueryValue(query[FORM_CANONICAL_QUERY_KEYS.searchField]),
	};
}

export function projectFormRouteQuery(query: LocationQuery): LocationQuery {
	return Object.fromEntries(Object.entries(query).filter(([key]) => isFormOwnedQueryKey(key) || isCanonicalFormQueryKey(key)));
}

export function formRouteFingerprint(query: LocationQuery): string {
	return JSON.stringify(
		Object.entries(projectFormRouteQuery(query))
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, value]) => [key, Array.isArray(value) ? value : (value ?? null)]),
	);
}

export function replaceFormRouteQuery(current: LocationQuery, scoped: ScopedFormQuery, compiled: CompiledFormState): LocationQueryRaw {
	const query: LocationQueryRaw = {};

	for (const [key, value] of Object.entries(current)) {
		if (isFormOwnedQueryKey(key) || isCanonicalFormQueryKey(key) || value == null) continue;
		query[key] = value;
	}

	if (compiled.cql) query[FORM_CANONICAL_QUERY_KEYS.cql] = compiled.cql;
	if (compiled.filter) query[FORM_CANONICAL_QUERY_KEYS.filter] = compiled.filter;
	if (compiled.searchField) query[FORM_CANONICAL_QUERY_KEYS.searchField] = compiled.searchField;

	for (const [key, value] of Object.entries(scoped)) {
		if (value != null) query[key] = value;
	}

	return query;
}
