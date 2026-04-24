import { corpusDataLoader } from "@/features/corpus/resources/corpus-resource";
import { useCustomCss, useCustomJs, useFavicon, useTitle } from "@/interop/page-customization";
import { setLegacyIndexIdGlobal } from "@/interop/window-globals";
import { isRouteBootstrapSettled } from "@/navigation/page-bootstrap";
import type { CustomRouteMeta } from "@/navigation/router";
import type { CFCustomCssEntry, CFCustomJsEntry } from "@/types/apptypes";
import { computed, watchEffect } from "vue";
import { useRoute } from "vue-router";

function sortCustomizationEntries<T extends CFCustomCssEntry | CFCustomJsEntry>(entries: T[]): T[] {
	return [...entries].sort((left, right) => left.index - right.index);
}

export function startCustomizationInterop() {
	const route = useRoute();
	const routeMeta = computed(() => route.meta as CustomRouteMeta);
	const pageName = computed(() => routeMeta.value?.name ?? '');
	const displayName = computed(() => corpusDataLoader.value?.config.displayName ?? '');

	// Set this one up first, so the variable is guaranteed to be set before dependent custom js is executed.
	watchEffect(() => setLegacyIndexIdGlobal(route.params.indexId as string || ''));

	useTitle(computed(() => routeMeta.value?.getTitle?.(displayName.value) ?? displayName.value));

	const _css = useCustomCss(computed(() => {
		const css = corpusDataLoader.value?.config.customCss ?? {};
		return sortCustomizationEntries([...(css[''] ?? []), ...(pageName.value ? css[pageName.value] ?? [] : [])]);
	}))

	const js = useCustomJs(computed(() => {
		const js = corpusDataLoader.value?.config.customJs ?? {};
		return sortCustomizationEntries([...(js[''] ?? []), ...(pageName.value ? js[pageName.value] ?? [] : [])]);
	}), {immediate: false});

	const _fav = useFavicon(computed(() => {
		const path = corpusDataLoader.value?.config?.faviconDir;
		return path ? `${path}/favicon.ico` : '';
	}), {
		rel: 'icon'
	})

	watchEffect(() => {
		// wait for rendering of page to complete before inserting js (if required)
		// Otherwise, the js may miss things in the page.
		if (route && isRouteBootstrapSettled(route)) js.enable();
		else js.disable();
	})
}