import { computed, watchEffect } from 'vue';

import { useCorpusContextLoader } from '@/app/state/useCorpusContext';
import { useCustomCss, useCustomJs, useFavicon, useTitle } from '@/interop/page-customization';
import { setLegacyIndexIdGlobal } from '@/interop/window-globals';
import { usePageBootstrap } from '@/navigation/page-bootstrap';
import { useCorpusId } from '@/navigation/router';
import type { CFCustomCssEntry, CFCustomJsEntry } from '@/types/apptypes';

/** Preserve the declared order after global and page-specific customization lists are merged. */
function sortCustomizationEntries<T extends CFCustomCssEntry | CFCustomJsEntry>(entries: T[]): T[] {
	return [...entries].sort((left, right) => left.index - right.index);
}

export function startCustomizationInterop() {
	// since this is persistent and runs on all pages, make sure we use the true context, not the one that pretends it's loaded.
	const context = useCorpusContextLoader();
	const pageBootstrap = usePageBootstrap();

	// const routeMeta = usePageMeta();
	const indexId = useCorpusId();
	const pageName = computed(() => pageBootstrap.page.value?.name ?? '');
	const displayName = computed(() => {
		if (!context.isLoaded()) return '';
		const config = context.value.config;
		const corpus = context.value.index;
		return config.displayName || corpus?.displayName || indexId.value || 'Blacklab Frontend';
	});

	// Set this one up first, so the variable is guaranteed to be set before dependent custom js is executed.
	watchEffect(() => setLegacyIndexIdGlobal(indexId.value || ''));

	useTitle(computed(() => pageBootstrap.page.value?.getTitle?.(displayName.value) ?? displayName.value));

	useCustomCss(
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

	useFavicon(
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
		if (pageBootstrap.settled.value) js.enable();
		else js.disable();
	});
}
