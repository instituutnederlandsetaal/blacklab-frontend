import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import { useCorpusContextLoader } from '@/app/state/useCorpusContext';
import { useCustomCss, useCustomJs, useFavicon, useTitle } from '@/interop/page-customization';
import { setLegacyIndexIdGlobal } from '@/interop/window-globals';
import { isRouteBootstrapSettled } from '@/navigation/page-bootstrap';
import { useCorpusId, useRouteMeta } from '@/navigation/router';
import type { CFCustomCssEntry, CFCustomJsEntry } from '@/types/apptypes';

function sortCustomizationEntries<T extends CFCustomCssEntry | CFCustomJsEntry>(entries: T[]): T[] {
	return [...entries].sort((left, right) => left.index - right.index);
}

export function startCustomizationInterop() {
	const route = useRoute();
	// since this is persistent and runs on all pages, make sure we use the true context, not the one that pretends it's loaded.
	const context = useCorpusContextLoader();
	const routeMeta = useRouteMeta();
	const indexId = useCorpusId();
	const pageName = computed(() => routeMeta.value?.name ?? '');
	const displayName = computed(() => (context.isLoaded() ? (context.value.index?.displayName ?? '') : ''));

	// Set this one up first, so the variable is guaranteed to be set before dependent custom js is executed.
	watchEffect(() => setLegacyIndexIdGlobal(indexId.value || ''));

	useTitle(computed(() => routeMeta.value?.getTitle?.(displayName.value) ?? displayName.value ?? 'BlackLab Frontend'));

	const _css = useCustomCss(
		computed(() => {
			const css = context.value?.config.customCss ?? {};
			return sortCustomizationEntries([...(css[''] ?? []), ...(pageName.value ? (css[pageName.value] ?? []) : [])]);
		}),
	);

	const js = useCustomJs(
		computed(() => {
			const js = context.value?.config.customJs ?? {};
			return sortCustomizationEntries([...(js[''] ?? []), ...(pageName.value ? (js[pageName.value] ?? []) : [])]);
		}),
		{ immediate: false },
	);

	const _fav = useFavicon(
		computed(() => {
			const path = context.value?.config.faviconDir;
			return path ? `${path}/favicon.ico` : '';
		}),
		{
			rel: 'icon',
		},
	);

	watchEffect(() => {
		// wait for rendering of page to complete before inserting js (if required)
		// Otherwise, the js may miss things in the page.
		if (route && isRouteBootstrapSettled(route)) js.enable();
		else js.disable();
	});
}
