import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router';

import { FORM_QUERY_PREFIX, type CompiledFormState, type ScopedFormQuery } from '@/features/form';

export const FORM_CANONICAL_QUERY_KEYS = ['patt', 'filter', 'searchfield'] as const;

type FormCanonicalQueryKey = (typeof FORM_CANONICAL_QUERY_KEYS)[number];
type CanonicalFormQuery = Record<FormCanonicalQueryKey, string | null>;

export function isFormOwnedQueryParameter(key: string): boolean {
	return key.startsWith(FORM_QUERY_PREFIX) || FORM_CANONICAL_QUERY_KEYS.includes(key as any);
}

function firstQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function readCanonicalFormQuery(query: LocationQuery): CanonicalFormQuery {
	return Object.fromEntries(FORM_CANONICAL_QUERY_KEYS.map(key => [key, firstQueryValue(query[key])])) as CanonicalFormQuery;
}

export function pickFormOwnedQueryParameters(query: LocationQuery): LocationQuery {
	return Object.fromEntries(Object.entries(query).filter(([key]) => isFormOwnedQueryParameter(key)));
}

export function formRouteFingerprint(query: LocationQuery): string {
	return JSON.stringify(
		Object.entries(pickFormOwnedQueryParameters(query))
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, value]) => [key, Array.isArray(value) ? value : (value ?? null)]),
	);
}

export function replaceFormRouteQuery(current: LocationQuery, scoped: ScopedFormQuery, compiled: CompiledFormState): LocationQueryRaw {
	const query: LocationQueryRaw = {};

	// Copy over everything that's not owned by the form system, to preserve unrelated query parameters (e.g. from other components or the app itself)
	for (const key in current) {
		if (isFormOwnedQueryParameter(key)) continue;
		query[key] = current[key];
	}
	// copy compiled query params
	for (const key of FORM_CANONICAL_QUERY_KEYS) {
		if (compiled[key]) query[key] = compiled[key];
	}
	// copy scoped params
	for (const key in scoped) {
		if (scoped[key]) query[key] = scoped[key];
	}

	return query;
}
