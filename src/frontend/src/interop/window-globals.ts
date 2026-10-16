import type { App, Ref } from 'vue';

import * as ArticleModule from '@/app/state/article-configuration';
import * as UIModule from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createExternalCustomizationApi } from '@/customization-api/external/browser-api';
import type { BlackLabFrontendCustomizationApi } from '@/customization-api/external/external-api';
import type { CustomizationRegistry } from '@/customization-api/registry';
import * as TagsetModule from '@/features/corpus/model/tagset-state';
import { createCorpusStoreAdapter } from '@/interop/legacy-store-adapters/corpus';
import { createFilterStoreAdapter } from '@/interop/legacy-store-adapters/filters';
import type { Corpus } from '@/types/apptypes';

type InteropWindow = Window & {
	vueApp?: App;
	vueRoot?: unknown;
	INDEX_ID?: string;
	frontend?: BlackLabFrontendCustomizationApi;
	printCustomJs?: () => void;
};

type InteropGlobal = typeof globalThis & {
	corpus?: CorpusContext;
	vuexModules?: Record<string, unknown>;
};

/** Expose the browser customization API used by corpus scripts. */
export function installCustomizationApiGlobals(registry: CustomizationRegistry) {
	(window as InteropWindow).frontend = createExternalCustomizationApi(registry);
}

/** Expose corpus configuration shared by the search and article pages. */
export function installCommonStoreGlobals(corpus: Ref<Corpus | undefined>, registry: CustomizationRegistry) {
	(globalThis as InteropGlobal).vuexModules = {
		root: ArticleModule,
		corpus: createCorpusStoreAdapter(corpus),
		ui: UIModule,
		tagset: TagsetModule,
		article: ArticleModule,
		filters: createFilterStoreAdapter(registry),
	};
	(window as InteropWindow).printCustomJs = UIModule.printCustomizations;
}

/** Expose compatibility stores supplied by the active page runtime. */
export function installLegacyStoreGlobals(modules: Record<string, unknown>) {
	const target = ((globalThis as InteropGlobal).vuexModules ??= {});
	Object.assign(target, modules);
}

/** Expose the Vue application handles retained for legacy scripts. */
export function installVueGlobals(app: App, root: unknown) {
	(window as InteropWindow).vueApp = app;
	(window as InteropWindow).vueRoot = root;
}

/** Expose the current corpus context retained for legacy scripts. */
export function installCorpusGlobal(value: CorpusContext) {
	(globalThis as InteropGlobal).corpus = value;
}

/** Expose the current index ID retained for legacy scripts. */
export function installIndexIdGlobal(value: string) {
	(window as InteropWindow).INDEX_ID = value;
}
