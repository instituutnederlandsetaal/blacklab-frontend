import { computed, watchEffect } from 'vue';

import { useCorpusContextLoader } from '@/app/state/useCorpusContext';
import { useCustomCss, useCustomJs, useFavicon, useTitle } from '@/interop/page-customization';
import { installIndexIdGlobal } from '@/interop/window-globals';
import { usePageBootstrap } from '@/navigation/page-bootstrap';
import { useCorpusId } from '@/navigation/router';

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
	watchEffect(() => installIndexIdGlobal(indexId.value || ''));

	useTitle(computed(() => pageBootstrap.page.value?.getTitle?.(displayName.value) ?? displayName.value));

	useCustomCss(
		computed(() => {
			const css = context.value?.config.customCss ?? {};
			return [...(css[''] ?? []), ...(pageName.value ? (css[pageName.value] ?? []) : [])].sort((left, right) => left.index - right.index);
		}),
	);

	useCustomJs(
		computed(() => {
			if (!pageBootstrap.settled.value) return [];
			const js = context.value?.config.customJs ?? {};
			return [...(js[''] ?? []), ...(pageName.value ? (js[pageName.value] ?? []) : [])].sort((left, right) => left.index - right.index);
		}),
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
}
