import cloneDeep from 'clone-deep';
import jsonStableStringify from 'json-stable-stringify';
import { computed, nextTick, watch, type Ref } from 'vue';
import type { LocationQuery, RouteLocationNormalizedLoaded, RouteLocationResolvedGeneric, Router } from 'vue-router';

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

type UrlSyncContext = {
	routeName: UrlManagedRouteName;
	route: RouteLocationNormalizedLoaded;
	corpus: Corpus;
	indexId: string;
};

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

function normalizeRouteQuery(query: LocationQuery): Record<string, string | string[] | null> {
	const normalized: Record<string, string | string[] | null> = {};
	for (const [key, value] of Object.entries(query)) {
		if (Array.isArray(value)) {
			normalized[key] = value.filter((item): item is string => typeof item === 'string');
		} else {
			normalized[key] = value ?? null;
		}
	}
	return normalized;
}

function stableRouteUrl(route: Pick<RouteLocationNormalizedLoaded | RouteLocationResolvedGeneric, 'path' | 'query' | 'hash'>): string {
	return (
		jsonStableStringify({
			hash: route.hash || '',
			path: route.path,
			query: normalizeRouteQuery(route.query),
		}) ?? ''
	);
}

function getStoreGeneratedUrl(router: Router, indexId: string, route: RouteLocationNormalizedLoaded) {
	const queryState = getCurrentQueryState(indexId, route);
	const urlPayload = stateSnapshotToUrlPayload(queryState);
	const resolvedRoute = router.resolve(toRouterPath(urlPayload.url));
	return {
		key: stableRouteUrl(resolvedRoute),
		queryState,
		resolvedRoute,
		urlPayload,
	};
}

function createBrowserHistoryEntry(value: QueryState): BrowserHistoryEntry {
	const { query, views, global } = value.state;
	const activeView = value.state.interface.viewedResults ? views[value.state.interface.viewedResults] : undefined;

	return {
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
}

function pushStoreStateToRouter(router: Router, snapshot: ReturnType<typeof getStoreGeneratedUrl>) {
	const entry = createBrowserHistoryEntry(snapshot.queryState);
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
		pattern: snapshot.queryState.params && snapshot.queryState.params.patt,
		url: snapshot.urlPayload.url,
	});

	const historyState = {
		[HISTORY_STATE_KEY]: entry,
	};

	debugLog('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', snapshot.urlPayload.url, entry);
	debugLog('history', `Calling router.push with entry:`, entry, `and url:`, snapshot.urlPayload.url);

	router
		.push({
			path: snapshot.resolvedRoute.path,
			query: snapshot.resolvedRoute.query,
			hash: snapshot.resolvedRoute.hash,
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
					const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
					history.replaceState({ ...existingState, ...historyState }, '', undefined);
					return;
				}
				console.error('Failed to push URL through router', e);
			},
		);
}

export default function startUrlSync(router: Router, dependencies: UrlStateSyncDependencies) {
	const loadedCorpus = computed<Corpus | null>(() => (dependencies.corpusContext.isLoaded() ? dependencies.corpusContext.value.index || null : null));
	let latestUrlApplyRun = 0;

	function getUrlSyncContext(): UrlSyncContext | null {
		const route = router.currentRoute.value;
		const routeName = getManagedRouteName(dependencies.pageMeta.value, route);
		const corpus = loadedCorpus.value;
		const indexId = dependencies.indexId.value;
		return routeName && corpus && indexId ? { routeName, route, corpus, indexId } : null;
	}

	const routerUrl = computed(() => {
		const context = getUrlSyncContext();
		return context ? stableRouteUrl(context.route) : null;
	});

	const storeUrl = computed(() => {
		const context = getUrlSyncContext();
		return context ? getStoreGeneratedUrl(router, context.indexId, context.route).key : null;
	});

	async function applyRouterUrlToStore(context: UrlSyncContext, run: number) {
		const newSearchFormDefinition = context.routeName === 'search' ? (dependencies.searchForms?.getDefinition() ?? null) : null;
		const shouldParseSearchUrl = context.routeName === 'search' && !!newSearchFormDefinition;
		const stateFromHistory = shouldParseSearchUrl ? null : getStoredHistoryEntry(history.state);
		const localSearchIntentRevision = RootStore.get.localSearchIntentRevision();
		let state = stateFromHistory;

		if (!state) {
			try {
				state =
					context.routeName === 'article'
						? await new UrlStateParserArticle(createUrlStateParserArticleDependencies({ corpus: context.corpus })).get()
						: await new UrlStateParserSearch(
								createUrlStateParserSearchDependencies({
									blacklabApi: dependencies.blacklabApi,
									corpus: context.corpus,
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
			debugLog('history', 'Skipping stale URL restore because a local search action ran while URL state was loading.', context.route.fullPath);
			return;
		}

		debugLog('history', stateFromHistory ? 'Restoring state from browser history.' : 'Restoring state from URL.', context.route.fullPath, state);
		if (newSearchFormDefinition) {
			restoreNewSearchFormFromRoute(context.route, context.corpus, newSearchFormDefinition);
		}
		RootStore.actions.replace(state);
		await nextTick();
	}

	const stopUrlSync = watch(
		() => [routerUrl.value, storeUrl.value] as const,
		async (current, previous) => {
			const context = getUrlSyncContext();
			const [currentRouterUrl, currentStoreUrl] = current;
			const [previousRouterUrl, previousStoreUrl] = previous ?? [null, null];
			if (!context || !currentRouterUrl || !currentStoreUrl) return;

			const routerChanged = currentRouterUrl !== previousRouterUrl;
			const storeChanged = currentStoreUrl !== previousStoreUrl;
			if (currentRouterUrl === currentStoreUrl) {
				return;
			}

			if (storeChanged && !routerChanged) {
				latestUrlApplyRun += 1;
				pushStoreStateToRouter(router, getStoreGeneratedUrl(router, context.indexId, context.route));
				return;
			}

			const run = ++latestUrlApplyRun;
			await applyRouterUrlToStore(context, run);
		},
		{
			immediate: true,
			flush: 'post',
		},
	);

	return () => {
		stopUrlSync();
	};
}
