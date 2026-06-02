/**
 * Routes can control customization scripts to be loaded
 * Some of these scripts rely on the page being fully rendering/initialized/bootstrapped
 * This listens to the current route, and can coordinate the state of the page
 */

import { computed, readonly, ref, watch, type App, type ObjectPlugin } from 'vue';
import { useRouter } from 'vue-router';

import type { CustomRouteMeta } from '@/app/routes/router-options';

import { providePageBootstrap } from '@/shared/route-bootstrap/useRouteBootstrap';

export function createRouteBootstrapPlugin(): ObjectPlugin {
	return {
		install(app: App) {
			app.runWithContext(() => {
				const router = useRouter();
				const pageName = computed(() => (router.currentRoute.value.meta as CustomRouteMeta).name);
				const pageCustomScriptTiming = computed(() => (router.currentRoute.value.meta as CustomRouteMeta).customScriptTiming ?? 'immediate');
				const pageBootstrapped = ref(false);
				const pageUrlParsed = ref(false);
				function markPageBootstrapped() {
					pageBootstrapped.value = true;
				}
				function markPageUrlParsed() {
					pageUrlParsed.value = true;
				}
				watch(
					pageName,
					() => {
						pageBootstrapped.value = false;
						pageUrlParsed.value = false;
					},
					{ immediate: true },
				);

				providePageBootstrap(app, {
					markPageBootstrapped,
					markPageUrlParsed,
					pageName,
					pageBootstrapped: readonly(pageBootstrapped),
					pageUrlParsed: readonly(pageUrlParsed),
					pageCustomScriptTiming: readonly(pageCustomScriptTiming),
				});
			});
		},
	};
}
