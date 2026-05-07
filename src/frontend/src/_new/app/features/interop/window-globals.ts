// import type { CorpusChange } from '@/_new/app/plugins/installCorpusData';
// import * as RootStore from '@/app/state/root-store';
// import * as UIModule from '@/app/state/ui-state';
// import * as ArticleModule from '@/features/article/model/article-state';
// import * as CorpusModule from '@/features/corpus/model/corpus-state';
// import * as TagsetModule from '@/features/corpus/model/tagset-state';
// import * as HistoryModule from '@/features/history/model/query-history-state';
// import * as ExploreModule from '@/features/search/model/form/explore-state';
// import * as FilterModule from '@/features/search/model/form/filter-state';
// import * as FormManager from '@/features/search/model/form/form-state';
// import * as GapModule from '@/features/search/model/form/gap-state';
// import * as InterfaceModule from '@/features/search/model/form/interface-state';
// import * as PatternModule from '@/features/search/model/form/pattern-state';
// import * as QueryModule from '@/features/search/model/query-state';
// import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
// import * as ViewModule from '@/features/search/model/results/view-state';
// import type { Loadable } from '@/utils/loadable';
// import type { App } from 'vue';

import type { App } from 'vue';

import type { CorpusChange } from '@/_new/app/plugins/installCorpusData';
import type { Loadable } from '@/_new/utils/loadable/loadable';

type InteropGlobal = typeof globalThis & {
	vueApp?: App;
	vueRoot?: unknown;
	INDEX_ID?: string;
	currentCorpusData?: Loadable<CorpusChange>;
	vuexModules?: unknown;
};

// function createResultsInterop() {
// 	return {
// 		...ViewModule,
// 		get hits() {
// 			return ViewModule.getOrCreateModule('hits');
// 		},
// 		get docs() {
// 			return ViewModule.getOrCreateModule('docs');
// 		},
// 	};
// }

// export function installLegacyStoreGlobals() {
// 	(globalThis as InteropGlobal).vuexModules = {
// 		root: {
// 			get: {
// 				...RootStore.get,
// 				...ArticleModule.get,
// 			},
// 			getState: ArticleModule.getState,
// 			actions: {
// 				...RootStore.actions,
// 				...ArticleModule.actions,
// 			},
// 			init: RootStore.init,
// 		},
// 		corpus: CorpusModule,
// 		history: HistoryModule,
// 		query: QueryModule,
// 		tagset: TagsetModule,
// 		ui: UIModule,
// 		explore: ExploreModule,
// 		form: FormManager,
// 		filters: FilterModule,
// 		interface: InterfaceModule,
// 		patterns: PatternModule,
// 		gap: GapModule,
// 		article: ArticleModule,
// 		results: createResultsInterop(),
// 		views: ViewModule,
// 		global: GlobalResultsModule,
// 	};
// }

export function setMountedVueGlobals(app: App, root: unknown) {
	(window as InteropGlobal).vueApp = app;
	(window as InteropGlobal).vueRoot = root;
}

export function setCurrentCorpusDataGlobal(value: Loadable<CorpusChange>) {
	(globalThis as InteropGlobal).currentCorpusData = value;
}

export function setLegacyIndexIdGlobal(value: string) {
	(window as InteropGlobal).INDEX_ID = value;
}

export function installLegacyStoreGlobals() {}
