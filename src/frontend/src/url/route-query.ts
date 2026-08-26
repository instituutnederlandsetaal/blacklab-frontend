import type { LocationQueryRaw, RouteLocationNormalizedLoaded, Router } from 'vue-router';

export type RouteQueryPatch = Record<string, string | number | boolean | null | undefined>;

/** Normalize a Vue Router path parameter to one non-empty string. */
export function getRouteParamString(value: unknown): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function getStringFromRouteQuery(route: RouteLocationNormalizedLoaded, ...keys: string[]): string | null {
	for (const key of keys) {
		const queryValue = route.query[key];
		const value = Array.isArray(queryValue) ? queryValue[0] : queryValue;
		if (typeof value === 'string' && value.length > 0) return value;
	}
	return null;
}

export function getNumberFromRouteQuery(route: RouteLocationNormalizedLoaded, key: string): number | null {
	const value = getStringFromRouteQuery(route, key);
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Read the first route key that names an annotated field in the current corpus. */
export function getAnnotatedFieldFromRouteQuery(route: RouteLocationNormalizedLoaded, fields: Record<string, unknown>, ...keys: string[]): string | null {
	const value = getStringFromRouteQuery(route, ...keys);
	return value && fields[value] ? value : null;
}

export function updateRouteQuery(router: Router, route: RouteLocationNormalizedLoaded, patch: RouteQueryPatch) {
	const query: LocationQueryRaw = {
		...route.query,
	};

	for (const [key, value] of Object.entries(patch)) {
		if (value == null) delete query[key];
		else query[key] = String(value);
	}

	return router.push({ name: route.name ?? undefined, params: route.params, query });
}
