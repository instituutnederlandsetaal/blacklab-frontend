import { readonly, ref, type App, type Ref } from 'vue';

import { type PageMeta } from '@/navigation/page-context';

import useInjectable from '@/shared/utils/useInjectable';

type PageBootstrap = {
	changePage(page: PageMeta, samePageInstance: boolean): void;
	markSettled(): void;
	settled: Ref<boolean>;
	page: Ref<PageMeta | null>;
};

const [_key, providePageBootstrap, usePageBootstrap] = useInjectable<PageBootstrap>('page-bootstrap');

function createPageBootstrapContext() {
	const settled = ref(false);
	const page = ref<PageMeta | null>(null);

	const context: PageBootstrap = {
		changePage(newPage, samePageInstance) {
			page.value = newPage;
			settled.value = (samePageInstance && settled.value) || newPage.customScriptTiming !== 'after-page-bootstrap';
		},
		markSettled() {
			settled.value = true;
		},
		settled: readonly(settled),
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
