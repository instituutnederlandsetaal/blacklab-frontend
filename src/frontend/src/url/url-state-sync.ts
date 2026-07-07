import cloneDeep from 'clone-deep';
import jsonStableStringify from 'json-stable-stringify';
import URI from 'urijs';
import { computed, nextTick, ref, shallowRef, watch, type Ref } from 'vue';
import type { LocationQuery, RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import type { Corpus, CorpusContext } from '@/app/state/useCorpusContext';
import { FORM_QUERY_PREFIX, restoreScopedFormState, type FormBuilder } from '@/features/form';
import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type { SearchFormSystem } from '@/features/search/model/search-form-system';
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
	searchForms?: SearchFormSystem;
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

function getFirstQueryString(query: LocationQuery, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = query[key];
		const first = Array.isArray(value) ? value.find((item): item is string => typeof item === 'string' && item !== '') : value;
		if (typeof first === 'string' && first !== '') return first;
	}
	return null;
}

export function getCanonicalFormParametersFromRoute(route: RouteLocationNormalizedLoaded, corpus: Pick<Corpus, 'isParallelCorpus'> | null = null): BlackLabParameters {
	const searchfield = getFirstQueryString(route.query, 'searchfield', 'searchField', 'field');
	return {
		patt: getFirstQueryString(route.query, 'patt', 'query'),
		filter: getFirstQueryString(route.query, 'filter'),
		searchfield: corpus && !corpus.isParallelCorpus ? null : searchfield,
	};
}

function hasScopedFormQuery(route: RouteLocationNormalizedLoaded): boolean {
	return Object.keys(route.query).some(key => key.startsWith(FORM_QUERY_PREFIX));
}

function restoreNewSearchFormFromRoute(route: RouteLocationNormalizedLoaded, corpus: Corpus, definition: FormBuilder): void {
	const canonical = getCanonicalFormParametersFromRoute(route, corpus);
	const query = hasScopedFormQuery(route) ? (route.query as Record<string, unknown>) : {};
	const restored = restoreScopedFormState(definition, query, canonical);
	definition.state.replaceState(restored);
	if (restored.issues.length) {
		debugLog('url', 'New search form URL restore issues', restored.issues);
	}
}

function getCurrentQueryState(indexId: string, route: RouteLocationNormalizedLoaded): QueryState {
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
}

function getSearchfieldFromStore(): string | null {
	try {
		return QueryStore.get.sourceField().id;
	} catch {
		return null;
	}
}

function toRouterPath(url: string): string {
	const context = (CONTEXT_URL || '').replace(/\/+$/, '');
	return !context || !url.startsWith(context) ? url : url.slice(context.length) || '/';
}

function stateSnapshotToUrlPayload(value: QueryState) {
	return stateToUrl({
		contextUrl: CONTEXT_URL,
		indexId: value.indexId,
		params: value.params,
		scopedFormQuery: QueryStore.get.scopedFormQuery(),
		pattern: QueryStore.get.patternString(),
		gapValue: value.state.query.gap?.value || null,
		searchfield: getSearchfieldFromStore(),
		article: value.article,
		state: value.state,
	});
}

function routeMatchesCurrentStoreUrl(router: Router, indexId: string, route: RouteLocationNormalizedLoaded): boolean {
	const urlPayload = stateSnapshotToUrlPayload(getCurrentQueryState(indexId, route));
	return router.resolve(toRouterPath(urlPayload.url)).fullPath === route.fullPath;
}

export default function startUrlSync(router: Router, dependencies: UrlStateSyncDependencies) {
	const loadedCorpus = computed<Corpus | null>(() => (dependencies.corpusContext.isLoaded() ? dependencies.corpusContext.value.index || null : null));
	const readyNavigationKey = ref<string | null>(null);
	const pendingSelfNavigation = shallowRef<{ fullPath: string; state: { [HISTORY_STATE_KEY]: BrowserHistoryEntry } } | null>(null);
	let latestUrlApplyRun = 0;

	const stopUrlToStore = watch(
		() => {
			const route = router.currentRoute.value;
			const routeName = getManagedRouteName(dependencies.pageMeta.value, route);
			const corpus = loadedCorpus.value;
			const indexId = dependencies.indexId.value;
			return routeName && corpus && indexId
				? {
						navigationKey: `${routeName}:${indexId}:${route.fullPath}`,
						routeName,
						route,
						corpus,
						indexId,
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
				readyNavigationKey.value = current.navigationKey;
				return;
			}

			if (current.routeName === 'search' && routeMatchesCurrentStoreUrl(router, current.indexId, current.route)) {
				readyNavigationKey.value = current.navigationKey;
				return;
			}

			const newSearchFormDefinition = current.routeName === 'search' ? (dependencies.searchForms?.getDefinition() ?? null) : null;
			const shouldParseSearchUrl = current.routeName === 'search' && !!newSearchFormDefinition;
			const stateFromHistory = shouldParseSearchUrl ? null : getStoredHistoryEntry(history.state);
			const localSearchIntentRevision = RootStore.get.localSearchIntentRevision();
			let state = stateFromHistory;

			if (!state) {
				try {
					state =
						current.routeName === 'article'
							? await new UrlStateParserArticle(createUrlStateParserArticleDependencies({ corpus: current.corpus })).get()
							: await new UrlStateParserSearch(
									createUrlStateParserSearchDependencies({
										blacklabApi: dependencies.blacklabApi,
										corpus: current.corpus,
									}),
								).get();
				} catch (e) {
					console.error('Failed to restore URL state', e);
					return;
				}
			}

			if (run !== latestUrlApplyRun) {
				return;
			}
			if (RootStore.get.localSearchIntentRevision() !== localSearchIntentRevision) {
				debugLog('history', 'Skipping stale URL restore because a local search action ran while URL state was loading.', current.route.fullPath);
				readyNavigationKey.value = current.navigationKey;
				return;
			}

			debugLog('history', stateFromHistory ? 'Restoring state from browser history.' : 'Restoring state from URL.', current.route.fullPath, state);
			if (newSearchFormDefinition) {
				restoreNewSearchFormFromRoute(current.route, current.corpus, newSearchFormDefinition);
			}
			RootStore.actions.replace(state);
			await nextTick();
			if (run === latestUrlApplyRun) {
				readyNavigationKey.value = current.navigationKey;
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

			return getCurrentQueryState(indexId, route);
		},
		value => {
			if (!value) {
				return;
			}

			const urlPayload = stateSnapshotToUrlPayload(value);

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

			const resolvedTarget = router.resolve(toRouterPath(urlPayload.url));
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
