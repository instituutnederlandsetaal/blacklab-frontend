import URI from 'urijs';
import { computed, nextTick, watch, type App } from 'vue';
import { isNavigationFailure, NavigationFailureType, type RouteLocationNormalizedLoaded, type RouteLocationRaw, type Router } from 'vue-router';

type UrlProjection<Context> = {
	/** Return a stable context while this page is ready, or null when it is inactive. */
	context: (route: RouteLocationNormalizedLoaded) => Context | null;
	read: (route: RouteLocationNormalizedLoaded, context: Context) => void | Promise<unknown>;
	write: (route: RouteLocationNormalizedLoaded, context: Context) => RouteLocationRaw;
	leave?: () => void;
	normalize?: (route: RouteLocationNormalizedLoaded, context: Context) => RouteLocationRaw | undefined;
	published?: (route: ReturnType<Router['resolve']>, context: Context) => void;
};

/** Bind page state to the URL; only incoming navigation reads state back from it. */
export function createUrlProjection<Context>(router: Router, options: UrlProjection<Context>) {
	let stopped = false;
	let stopState: (() => void) | undefined;
	const pending = new Set<string>();
	const context = computed(() => options.context(router.currentRoute.value));

	async function publish(location: RouteLocationRaw, source: Context, replace = false) {
		if (stopped || context.value !== source) return;
		const target = router.resolve(location);
		const identity = Math.random().toString(36).slice(2);
		pending.add(identity);
		try {
			const failure = await router.push({ ...target, replace, state: { blfProjection: identity } }).finally(() => pending.delete(identity));
			if (
				!failure &&
				!replace &&
				!stopped &&
				context.value === source &&
				router.currentRoute.value.fullPath === target.fullPath &&
				router.resolve(options.write(router.currentRoute.value, source)).fullPath === target.fullPath
			)
				options.published?.(target, source);
		} catch (error) {
			console.error('Failed to publish page URL', error);
		}
	}

	function restore(route: RouteLocationNormalizedLoaded, source: Context) {
		stopState?.();
		const restored = options.read(route, source);
		// Subscribe after hydration to preserve an incoming URL until the user changes state.
		stopState = watch(
			() => router.resolve(options.write(router.currentRoute.value, source)).fullPath,
			location => void publish(location, source),
			{ flush: 'post' },
		);
		const normalized = options.normalize?.(route, source);
		if (normalized) void publish(normalized, source, true);
		return restored;
	}

	const stopNavigation = watch(
		[router.currentRoute, context],
		([route, source], previous) => {
			if (source === null) {
				stopState?.();
				options.leave?.();
			} else if (previous?.[1] !== source || !pending.has(router.options.history.state.blfProjection as string)) {
				void restore(route, source);
			}
		},
		{ immediate: true },
	);

	function stop() {
		stopped = true;
		stopNavigation();
		stopState?.();
	}

	return {
		stop,
		install: (app: App) => app.onUnmount(stop),
		open: async (url: string) => {
			await nextTick();
			if (stopped) return;
			const uri = new URI(url).host('').protocol('').port('');
			const base = router.options.history.base.replace(/\/+$/, '');
			const path = uri.path();
			if (base && (path === base || path.startsWith(base + '/'))) uri.path(path.slice(base.length) || '/');
			const target = uri.toString();
			const failure = await router.push(target);
			// Loading the current saved URL still restores a draft edited since submission.
			if (isNavigationFailure(failure, NavigationFailureType.duplicated) && router.currentRoute.value.fullPath === router.resolve(target).fullPath && context.value !== null) {
				await restore(router.currentRoute.value, context.value);
			}
		},
	};
}
