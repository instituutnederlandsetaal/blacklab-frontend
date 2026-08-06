import type { LocationQueryRaw, LocationQueryValue, RouteLocationNormalizedLoaded, Router } from 'vue-router';

export type RouteQueryPatch = Record<string, string | number | boolean | null | undefined>;

export function getRouteParamString(value: unknown): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function firstRouteQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function getStringFromRouteQuery(route: RouteLocationNormalizedLoaded, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = firstRouteQueryValue(route.query[key]);
		if (value != null) return value;
	}
	return null;
}

export function getNumberFromRouteQuery(route: RouteLocationNormalizedLoaded, key: string): number | null {
	const value = getStringFromRouteQuery(route, key);
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

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
