import { nextTick, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';

export type CustomScriptTiming = 'immediate' | 'after-page-bootstrap';

const pendingBootstrapRouteKey = ref<string | null>(null);
const settledBootstrapRouteKey = ref<string | null>(null);

function getRouteKey(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'meta'>): string | null {
	const pageName = route.meta.name;
	if (typeof pageName === 'string' && pageName.length > 0) {
		return pageName;
	}

	return typeof route.name === 'string' && route.name.length > 0 ? route.name : null;
}

export function resetPageBootstrapForRoute(route: RouteLocationNormalizedLoaded, timing: CustomScriptTiming = 'immediate'): void {
	const routeKey = getRouteKey(route);
	if (!routeKey) {
		pendingBootstrapRouteKey.value = null;
		settledBootstrapRouteKey.value = null;
		return;
	}

	if (timing === 'after-page-bootstrap') {
		pendingBootstrapRouteKey.value = routeKey;
		settledBootstrapRouteKey.value = null;
		return;
	}

	pendingBootstrapRouteKey.value = null;
	settledBootstrapRouteKey.value = routeKey;
}

export function markPageBootstrapSettled(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'meta'>): void {
	const routeKey = getRouteKey(route);
	if (!routeKey) {
		return;
	}

	if (pendingBootstrapRouteKey.value && pendingBootstrapRouteKey.value !== routeKey) {
		return;
	}

	settledBootstrapRouteKey.value = routeKey;
	if (pendingBootstrapRouteKey.value === routeKey) {
		pendingBootstrapRouteKey.value = null;
	}
}

export function isRouteBootstrapSettled(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'meta'>): boolean {
	const timing = (route.meta.customScriptTiming ?? 'immediate') as CustomScriptTiming;
	const routeKey = getRouteKey(route);
	return timing !== 'after-page-bootstrap' || (routeKey != null && settledBootstrapRouteKey.value === routeKey);
}

export function useMarkPageBootstrapSettledWhen(isSettled: MaybeRefOrGetter<boolean>): void {
	const route = useRoute();

	watch(
		() => ({ settled: toValue(isSettled), routeKey: getRouteKey(route) }),
		({ settled, routeKey }) => {
			if (!settled || routeKey == null) {
				return;
			}

			void nextTick(() => {
				if (getRouteKey(route) === routeKey) {
					markPageBootstrapSettled(route);
				}
			});
		},
		{ immediate: true },
	);
}
