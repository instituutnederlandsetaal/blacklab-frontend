import type { LocationQuery, LocationQueryRaw, LocationQueryValue } from 'vue-router';

import { FORM_QUERY_PREFIX, type CompiledFormState } from '@/features/form';
import { NATIVE_BLACKLAB_PARAMETERS, type BlackLabParameter } from '@/features/form/model/types/blacklab-params';

type CanonicalFormQuery = Record<BlackLabParameter, string | null>;

export function isFormOwnedQueryParameter(key: string): boolean {
	return key.startsWith(FORM_QUERY_PREFIX) || NATIVE_BLACKLAB_PARAMETERS.includes(key as BlackLabParameter);
}

function firstQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
	return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function readCanonicalFormQuery(query: LocationQuery): CanonicalFormQuery {
	return Object.fromEntries(NATIVE_BLACKLAB_PARAMETERS.map(key => [key, firstQueryValue(query[key])])) as CanonicalFormQuery;
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

export function replaceFormRouteQuery(current: LocationQuery, compiled: CompiledFormState): LocationQueryRaw {
	const query: LocationQueryRaw = {};

	// Copy over everything that's not owned by the form system, to preserve unrelated query parameters (e.g. from other components or the app itself)
	for (const key in current) {
		if (isFormOwnedQueryParameter(key)) continue;
		query[key] = current[key];
	}
	// copy compiled query params
	for (const key of NATIVE_BLACKLAB_PARAMETERS) {
		if (compiled[key]) query[key] = compiled[key];
	}
	// copy scoped params
	for (const key in compiled.encoded) {
		if (compiled.encoded[key]) query[key] = compiled.encoded[key];
	}

	return query;
}
