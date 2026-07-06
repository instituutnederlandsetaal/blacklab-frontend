import { type App } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as UIModule from '@/app/state/ui-state';
import { useCorpus, type CorpusContext } from '@/app/state/useCorpusContext';
import * as ArticleModule from '@/features/article/model/article-state';
import * as TagsetModule from '@/features/corpus/model/tagset-state';
import * as HistoryModule from '@/features/history/model/query-history-state';
import * as ExploreModule from '@/features/search/model/form/explore-state';
import * as FilterModule from '@/features/search/model/form/filter-state';
import * as FormManager from '@/features/search/model/form/form-state';
import * as GapModule from '@/features/search/model/form/gap-state';
import * as InterfaceModule from '@/features/search/model/form/interface-state';
import * as PatternModule from '@/features/search/model/form/pattern-state';
import * as QueryModule from '@/features/search/model/query-state';
import * as GlobalResultsModule from '@/features/search/model/results/global-results-state';
import * as ViewModule from '@/features/search/model/results/view-state';
import { createCorpusStoreAdapter } from '@/interop/legacy-store-adapters/corpus';

type InteropWindow = Window & {
	vueApp?: App;
	vueRoot?: unknown;
	INDEX_ID?: string;
};

type InteropGlobal = typeof globalThis & {
	currentCorpusData?: CorpusContext;
	vuexModules?: unknown;
};

function createResultsInterop() {
	return {
		...ViewModule,
		get hits() {
			return ViewModule.getOrCreateModule('hits');
		},
		get docs() {
			return ViewModule.getOrCreateModule('docs');
		},
	};
}

export function installLegacyStoreGlobals(app: App) {
	const corpus = app.runWithContext(() => createCorpusStoreAdapter(useCorpus()));

	const vuexModules = {
		root: {
			get: {
				...RootStore.get,
				...ArticleModule.get,
			},
			getState: ArticleModule.getState,
			actions: {
				...RootStore.actions,
				...ArticleModule.actions,
			},
			init: RootStore.init,
		},
		corpus,
		history: HistoryModule,
		query: QueryModule,
		tagset: TagsetModule,
		ui: UIModule,
		explore: ExploreModule,
		form: FormManager,
		filters: FilterModule,
		interface: InterfaceModule,
		patterns: PatternModule,
		gap: GapModule,
		article: ArticleModule,
		results: createResultsInterop(),
		views: ViewModule,
		global: GlobalResultsModule,
	};

	(globalThis as InteropGlobal).vuexModules = vuexModules;
}

export function setMountedVueGlobals(app: App, root: unknown) {
	(window as InteropWindow).vueApp = app;
	(window as InteropWindow).vueRoot = root;
}

export function setCurrentCorpusDataGlobal(value: CorpusContext) {
	(globalThis as InteropGlobal).currentCorpusData = value;
}

export function setLegacyIndexIdGlobal(value: string) {
	(window as InteropWindow).INDEX_ID = value;
}
