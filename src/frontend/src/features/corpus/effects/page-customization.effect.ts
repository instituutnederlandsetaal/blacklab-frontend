import { corpusDataLoader } from "@/features/corpus/resources/corpus-resource";
import { useCustomCss, useCustomJs, useFavicon } from "@/interop/page-customization";
import { isRouteBootstrapSettled } from "@/navigation/page-bootstrap";
import { computed, watchEffect } from "vue";
import { useRoute } from "vue-router";

export function startCustomizationInterop() {
	const route = useRoute();
	const pageName = computed(() => route.name?.toString());
	
	const _css = useCustomCss(computed(() => {
		const css = corpusDataLoader.value?.config.customCss ?? {};
		return [...(css[''] ?? []), ...(pageName.value ? css[pageName.value] ?? [] : [])];
	}))

	const js = useCustomJs(computed(() => {
		const js = corpusDataLoader.value?.config.customJs ?? {};
		return [...(js[''] ?? []), ...(pageName.value ? js[pageName.value] ?? [] : [])];
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