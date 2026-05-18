import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

import { useCustomCss, useCustomJs, useFavicon, useTitle } from '@/app/interop/page-customization';
import { setLegacyIndexIdGlobal } from '@/app/interop/window-globals';
import { useRouteBootstrap } from '@/app/providers/providePageBootstrapState';
import type { CustomRouteMeta } from '@/app/routes/router-options';
import { useCurrentCorpusId } from '@/entities/corpus/model/current-corpus-id';
import { useCurrentConfig } from '@/entities/page-config/page-config';

function sortedEntries<T extends { index: number }>(entries: Record<string, T[]>, pageName: string) {
	const base = entries[''] ?? [];
	const page = pageName ? (entries[pageName] ?? []) : [];
	return base.concat(page).sort((a, b) => a.index - b.index);
}

export function startCustomizationInterop() {
	const pageBootstrap = useRouteBootstrap();
	const config = useCurrentConfig();
	const corpusId = useCurrentCorpusId();
	const route = useRoute();
	const getPageTitle = computed<(v: string) => string>(() => (route.meta as CustomRouteMeta)?.getTitle ?? (v => v));

	watchEffect(() => setLegacyIndexIdGlobal(corpusId.value || ''));
	useTitle(computed(() => getPageTitle.value(config.displayName ?? 'unknown')));

	useCustomCss(
		computed(() => sortedEntries(config.customCss, pageBootstrap.pageName.value)),
		{ immediate: true },
	);
	const js = useCustomJs(
		computed(() => sortedEntries(config.customJs, pageBootstrap.pageName.value)),
		{ immediate: false },
	);
	useFavicon(
		computed(() => (config.faviconDir ? `${config.faviconDir}/favicon.ico` : '')),
		{ rel: 'icon' },
	);

	watchEffect(() => {
		if (pageBootstrap.pageCustomScriptTiming.value === 'immediate' || pageBootstrap.pageBootstrapped.value) js.enable();
		else js.disable();
	});
}
