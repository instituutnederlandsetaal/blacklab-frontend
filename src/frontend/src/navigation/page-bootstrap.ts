import { computed, readonly, ref, type App, type Ref } from 'vue';

import { type PageMeta } from '@/navigation/page-context';

import useInjectable from '@/shared/utils/useInjectable';

type PageBootstrap = {
	changePage(page: PageMeta, samePageInstance: boolean): void;
	markScriptsReady(): void;
	markContentReady(): void;
	setCustomScriptsSettled(settled: boolean): void;
	/** Page bootstrap permits configured scripts to mount. */
	scriptsReady: Ref<boolean>;
	/** Configured scripts have loaded, failed or been disposed after page bootstrap. */
	customizationsReady: Readonly<Ref<boolean>>;
	contentReady: Ref<boolean>;
	page: Ref<PageMeta | null>;
};

const [_key, providePageBootstrap, usePageBootstrap] = useInjectable<PageBootstrap>('page-bootstrap');

function createPageBootstrapContext() {
	const scriptsReady = ref(false);
	const customScriptsSettled = ref(true);
	const contentReady = ref(false);
	const page = ref<PageMeta | null>(null);

	const context: PageBootstrap = {
		changePage(newPage, samePageInstance) {
			page.value = newPage;
			scriptsReady.value = (samePageInstance && scriptsReady.value) || newPage.customScriptTiming !== 'after-page-bootstrap';
			contentReady.value = samePageInstance && contentReady.value;
		},
		markScriptsReady() {
			scriptsReady.value = true;
			contentReady.value = true;
		},
		markContentReady() {
			contentReady.value = true;
		},
		setCustomScriptsSettled(settled) {
			customScriptsSettled.value = settled;
		},
		scriptsReady: readonly(scriptsReady),
		customizationsReady: computed(() => scriptsReady.value && customScriptsSettled.value),
		contentReady: readonly(contentReady),
		page: readonly(page),
	};

	return {
		...context,
		install(app: App) {
			providePageBootstrap(app, context);
		},
	};
}

export { createPageBootstrapContext, usePageBootstrap, type PageBootstrap };
