import cloneDeep from 'clone-deep';
import jsonStableStringify from 'json-stable-stringify';
import URI from 'urijs';
import { computed, nextTick, ref, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import type { Corpus, CorpusContext } from '@/app/state/useCorpusContext';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type { PageMeta } from '@/navigation/page-context';
import type * as BLTypes from '@/types/blacklabtypes';
import { getArticleUrlStateFromRoute } from '@/url/route-query';
import { stateToUrl, type ArticleUrlState } from '@/url/state-to-url';
import UrlStateParserArticle, { createUrlStateParserArticleDependencies } from '@/url/url-state-parser-article';
import UrlStateParserSearch, { createUrlStateParserSearchDependencies } from '@/url/url-state-parser-search';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { debugLog } from '@/shared/debug/debug';
import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';

type QueryState = {
	indexId?: string | null;
	params?: BLTypes.BLSearchParameters;
	state: {
		query: QueryStore.ModuleRootState;
		interface: InterfaceStore.ModuleRootState;
		global: GlobalResultsStore.ModuleRootState;
		views: ViewStore.ModuleRootState;
	};
	article?: ArticleUrlState | null;
};

type BrowserHistoryEntry = HistoryStore.HistoryEntry & { article?: ArticleUrlState };
type UrlManagedRouteName = 'search' | 'article';
type UrlStateSyncDependencies = {
	blacklabApi: BlackLabApi;
	corpusContext: LoadableFromRequest<CorpusContext>;
	indexId: Ref<string | undefined>;
	pageMeta: Ref<PageMeta | null>;
};

const HISTORY_STATE_KEY = 'cfHistoryState';

function getManagedRouteName(pageMeta: PageMeta | null, route: RouteLocationNormalizedLoaded): UrlManagedRouteName | null {
	const routeName = pageMeta?.name || (typeof route.name === 'string' ? route.name : null);
	return routeName === 'search' || routeName === 'article' ? routeName : null;
}

function getStoredHistoryEntry(state: unknown): BrowserHistoryEntry | null {
	if (!state || typeof state !== 'object') {
		return null;
	}
	const typed = state as Record<string, unknown>;
	const nested = typed[HISTORY_STATE_KEY] as BrowserHistoryEntry | undefined;
	if (nested && typeof nested === 'object') {
		return nested;
	}
	if ('interface' in typed && 'patterns' in typed) {
		return typed as unknown as BrowserHistoryEntry;
	}
	return null;
}

export default function startUrlSync(router: Router, dependencies: UrlStateSyncDependencies) {
	const loadedCorpus = computed<Corpus | null>(() => (dependencies.corpusContext.isLoaded() ? dependencies.corpusContext.value.index || null : null));
	const readyNavigationKey = ref<string | null>(null);
	const pendingSelfNavigation = ref<{ fullPath: string; state: { [HISTORY_STATE_KEY]: BrowserHistoryEntry } } | null>(null);
	let latestUrlApplyRun = 0;

	const stopUrlToStore = watch(
		() => {
			const route = router.currentRoute.value;
			const routeName = getManagedRouteName(dependencies.pageMeta.value, route);
			const corpus = loadedCorpus.value;
			const indexId = dependencies.indexId.value;
			return routeName && corpus && indexId
				? {
						key: `${routeName}:${indexId}:${route.fullPath}`,
						routeName,
						route,
						corpus,
					}
				: null;
		},
		async current => {
			const run = ++latestUrlApplyRun;
			readyNavigationKey.value = null;
			if (!current) {
				return;
			}

			const selfNavigation = pendingSelfNavigation.value;
			if (selfNavigation?.fullPath === current.route.fullPath) {
				const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
				history.replaceState({ ...existingState, ...selfNavigation.state }, '', undefined);
				pendingSelfNavigation.value = null;
				readyNavigationKey.value = current.key;
				return;
			}

			const stateFromHistory = getStoredHistoryEntry(history.state);
			let state = stateFromHistory;

			if (!state) {
				try {
					state =
						current.routeName === 'article'
							? await new UrlStateParserArticle(createUrlStateParserArticleDependencies({ corpus: current.corpus })).get()
							: await new UrlStateParserSearch(createUrlStateParserSearchDependencies({ blacklabApi: dependencies.blacklabApi, corpus: current.corpus })).get();
				} catch (e) {
					console.error('Failed to restore URL state', e);
					return;
				}
			}

			if (run !== latestUrlApplyRun) {
				return;
			}

			debugLog('history', stateFromHistory ? 'Restoring state from browser history.' : 'Restoring state from URL.', current.route.fullPath, state);
			RootStore.actions.replace(state);
			await nextTick();
			if (run === latestUrlApplyRun) {
				readyNavigationKey.value = current.key;
			}
		},
		{
			immediate: true,
			flush: 'post',
		},
	);

	const stopStoreToUrl = watch(
		() => {
			const route = router.currentRoute.value;
			const routeName = getManagedRouteName(dependencies.pageMeta.value, route);
			const indexId = dependencies.indexId.value;
			if (!routeName || !loadedCorpus.value || !indexId || readyNavigationKey.value !== `${routeName}:${indexId}:${route.fullPath}`) {
				return null;
			}

			return cloneDeep({
				indexId,
				params: RootStore.get.blacklabParameters(),
				article: getArticleUrlStateFromRoute(route),
				state: {
					views: ViewStore.getState(),
					global: GlobalResultsStore.getState(),
					interface: InterfaceStore.getState(),
					query: QueryStore.getState(),
				},
			}) satisfies QueryState;
		},
		value => {
			if (!value) {
				return;
			}

			let searchfield: string | null = null;
			try {
				searchfield = QueryStore.get.sourceField().id;
			} catch {
				searchfield = null;
			}

			const urlPayload = stateToUrl({
				contextUrl: CONTEXT_URL,
				indexId: value.indexId,
				params: value.params,
				pattern: QueryStore.get.patternString(),
				gapValue: QueryStore.getState().gap?.value || null,
				searchfield,
				article: value.article,
				state: value.state,
			});

			const currentUrl = new URI().host('').protocol('').port('').toString().replace(/\/+$/, '');
			const lastState = getStoredHistoryEntry(history.state);
			const urlAlreadyCorrect = currentUrl === urlPayload.url;
			const truncatedStateAlreadyCorrect =
				urlPayload.isTruncated &&
				lastState?.interface &&
				lastState.patterns &&
				lastState.gap &&
				jsonStableStringify({ formState: value.state.query.formState, gap: value.state.query.gap }) ===
					jsonStableStringify({ formState: lastState.patterns[lastState.interface.patternMode], gap: lastState.gap });

			if (urlAlreadyCorrect && (!urlPayload.isTruncated || !lastState || truncatedStateAlreadyCorrect)) {
				return;
			}

			const { query, views, global } = value.state;
			const activeView = value.state.interface.viewedResults ? views[value.state.interface.viewedResults] : undefined;
			const entry: BrowserHistoryEntry = {
				filters: query.filters || {},
				global,
				view: activeView || cloneDeep(ViewStore.initialViewState),
				explore:
					query.form === 'explore'
						? {
								...ExploreStore.defaults,
								[query.subForm]: query.formState,
							}
						: ExploreStore.defaults,
				patterns:
					query.form === 'search'
						? {
								...PatternStore.defaults,
								[query.subForm]: query.formState,
								shared: query.shared,
							}
						: PatternStore.defaults,
				interface: {
					form: query.form ? query.form : 'search',
					exploreMode: query.form === 'explore' ? query.subForm : 'ngram',
					patternMode: query.form === 'search' ? query.subForm : 'simple',
					viewedResults: value.state.interface.viewedResults,
					activeAnnotationTab: value.state.interface.activeAnnotationTab,
					activeFilterTab: value.state.interface.activeFilterTab,
				},
				gap: query.gap || GapStore.defaults,
				article: value.article || undefined,
			};

			HistoryStore.actions.addEntry({
				entry: {
					filters: entry.filters,
					global: entry.global,
					view: entry.view,
					explore: entry.explore,
					patterns: entry.patterns,
					interface: entry.interface,
					gap: entry.gap,
				},
				pattern: value.params && value.params.patt,
				url: urlPayload.url,
			});

			const context = (CONTEXT_URL || '').replace(/\/+$/, '');
			const routerPath = !context || !urlPayload.url.startsWith(context) ? urlPayload.url : urlPayload.url.slice(context.length) || '/';
			const resolvedTarget = router.resolve(routerPath);
			const historyState = {
				[HISTORY_STATE_KEY]: entry,
			};
			pendingSelfNavigation.value = {
				fullPath: resolvedTarget.fullPath,
				state: historyState,
			};

			debugLog('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', urlPayload.url, entry);
			debugLog('history', `Calling router.push with entry:`, entry, `and url:`, urlPayload.url);

			router
				.push({
					path: resolvedTarget.path,
					query: resolvedTarget.query,
					hash: resolvedTarget.hash,
					state: historyState as any,
				})
				.then(
					() => {
						const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
						history.replaceState({ ...existingState, ...historyState }, '', undefined);
					},
					e => {
						const maybeError = e as { name?: string; message?: string } | null;
						if (maybeError?.name === 'NavigationDuplicated' || (maybeError?.message || '').includes('Avoided redundant navigation')) {
							if (pendingSelfNavigation.value?.fullPath === resolvedTarget.fullPath) {
								pendingSelfNavigation.value = null;
							}
							const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
							history.replaceState({ ...existingState, ...historyState }, '', undefined);
							return;
						}
						if (pendingSelfNavigation.value?.fullPath === resolvedTarget.fullPath) {
							pendingSelfNavigation.value = null;
						}
						console.error('Failed to push URL through router', e);
					},
				);
		},
		{
			immediate: true,
			deep: true,
			flush: 'post',
		},
	);

	return () => {
		stopUrlToStore();
		stopStoreToUrl();
	};
}
