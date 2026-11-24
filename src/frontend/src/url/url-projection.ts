import { computed, watch, type App } from 'vue';
import { type RouteLocationNormalizedLoaded, type RouteLocationResolved, type RouteLocationRaw, type Router } from 'vue-router';

type UrlProjection<Context> = {
	/** Return a stable context while this page is ready, or null when it is inactive. */
	context: (route: RouteLocationNormalizedLoaded) => Context | null;
	/** Apply every value used by write() before the first await. The draft may finish restoring asynchronously. */
	read: (route: RouteLocationNormalizedLoaded, replaceUrl: (location: RouteLocationRaw) => void) => void;
	write: (route: RouteLocationNormalizedLoaded, context: Context) => RouteLocationRaw;
	leave?: () => void;
	published?: (route: RouteLocationResolved) => void;
};

/** Bind page state to the URL; only incoming navigation reads state back from it. */
export function createUrlProjection<Context>(router: Router, options: UrlProjection<Context>) {
	// Mark only in-flight writes so Back and Forward can revisit a published entry.
	const pending = new Set<string>();
	async function publish(location: RouteLocationRaw, replace = false) {
		const target = router.resolve(location);
		const identity = Math.random().toString(36).slice(2);
		pending.add(identity);
		try {
			const { path, query, hash } = target;
			const failure = await router.push({ path, query, hash, replace, state: { blfProjection: identity } });
			if (!failure && router.currentRoute.value.fullPath === target.fullPath) return target;
		} catch (error) {
			console.error('Failed to publish page URL', error);
		} finally {
			pending.delete(identity);
		}
	}

	let stopState: (() => void) | undefined;
	const context = computed(() => options.context(router.currentRoute.value));

	function restore(route: RouteLocationNormalizedLoaded, source: Context) {
		stopState?.();
		options.read(route, location => void publish(location, true));
		// Subscribe after hydration to preserve an incoming URL until the user changes state.
		const path = computed(() => router.resolve(options.write(router.currentRoute.value, source)).fullPath);
		stopState = watch(
			path,
			async (location, _, onCleanup) => {
				let current = true;
				onCleanup(() => (current = false));
				const target = await publish(location);
				if (target && current && path.value === location) options.published?.(target);
			},
			{ flush: 'post' },
		);
	}

	const stopNavigation = watch(
		[router.currentRoute, context],
		([route, source], previous) => {
			if (source === null) {
				stopState?.();
				options.leave?.();
			} else if (previous?.[1] !== source || !pending.has(router.options.history.state.blfProjection as string)) {
				restore(route, source);
			}
		},
		{ immediate: true },
	);

	function stop() {
		stopNavigation();
		stopState?.();
	}

	return { stop, install: (app: App) => app.onUnmount(stop) };
}
