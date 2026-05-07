import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import { useCustomCss, useCustomJs, useFavicon, useTitle } from '@/_new/app/features/interop/page-customization';
import { setLegacyIndexIdGlobal } from '@/_new/app/features/interop/window-globals';
import { useCurrentConfig } from '@/_new/app/plugins/installCorpusData';
import { useRouteBootstrap } from '@/_new/app/plugins/installRoutePageBootstrapped';
import { useCurrentCorpusId } from '@/_new/app/plugins/installRouter';
import type { CustomRouteMeta } from '@/_new/app/routes/router-options';

function sortedEntries<T extends { index: number }>(entries: Record<string, T[]>, pageName: string) {
	const base = entries[''] ?? [];
	const page = pageName ? (entries[pageName] ?? []) : [];
	const values = base.concat(page).sort((a, b) => a.index - b.index);
	return values;
}

export function startCustomizationInterop() {
	const pageBootstrap = useRouteBootstrap();
	const config = useCurrentConfig();
	const corpusId = useCurrentCorpusId();
	const route = useRoute();
	const getPageTitle = computed<(v: string) => string>(() => (route.meta as CustomRouteMeta)?.getTitle ?? (v => v));

	// Set this one up first, so the variable is guaranteed to be set before dependent custom js is executed.
	// TODO?
	watchEffect(() => setLegacyIndexIdGlobal(corpusId.value || ''));
	useTitle(computed(() => getPageTitle.value(config.displayName ?? 'unknown')));

	const _css = useCustomCss(
		computed(() => sortedEntries(config.customCss, pageBootstrap.pageName.value)),
		{ immediate: true },
	);
	const js = useCustomJs(
		computed(() => sortedEntries(config.customJs, pageBootstrap.pageName.value)),
		{ immediate: false },
	);
	const _fav = useFavicon(
		computed(() => (config.faviconDir ? `${config.faviconDir}/favicon.ico` : '')),
		{ rel: 'icon' },
	);

	// Only insert JS when page is loaded, or before that if the timing is set to immediate
	// to prevent js from trying to interact with page properties or DOM that isn't present yet.
	watchEffect(() => {
		if (pageBootstrap.pageCustomScriptTiming.value === 'immediate' || pageBootstrap.pageBootstrapped.value) js.enable();
		else js.disable();
	});
}
