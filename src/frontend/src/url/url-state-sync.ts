import cloneDeep from 'clone-deep';
import jsonStableStringify from 'json-stable-stringify';
import { EMPTY, ReplaySubject, fromEvent, of } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
import URI from 'urijs';
import { watch } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import { useCorpus } from '@/app/state/useCorpusContext';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type * as BLTypes from '@/types/blacklabtypes';
import { getArticleUrlStateFromRoute } from '@/url/route-query';
import { stateToUrl, type ArticleUrlState } from '@/url/state-to-url';
import UrlStateParserArticle from '@/url/url-state-parser-article';
import UrlStateParserSearch from '@/url/url-state-parser-search';

import { debugLog } from '@/shared/debug/debug';

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
type SyncWatchState = QueryState & { routeName: string | null };

const HISTORY_STATE_KEY = 'cfHistoryState';
const urlInputParameters$ = new ReplaySubject<QueryState>(1);

let stopStoreToUrlReflectionHandle: (() => void) | null = null;
let stopBrowserHistoryRestoreHandle: (() => void) | null = null;
let initialUrlStateAppliedPromise: Promise<void> | null = null;

function isUrlManagedRoute(routeName: string | null): routeName is UrlManagedRouteName {
	return routeName === 'search' || routeName === 'article';
}

function getRouteName(route: RouteLocationNormalizedLoaded): string | null {
	return typeof route.name === 'string' ? route.name : null;
}

function getUrlRouteNameFromLocation(): UrlManagedRouteName | null {
	const pathSegments = new URI().segmentCoded().filter(s => !!s);
	const contextSegments = new URI(CONTEXT_URL).segmentCoded().filter(s => !!s);
	const relativeSegments = pathSegments.slice(contextSegments.length);
	if (relativeSegments[1] === 'docs' && !!relativeSegments[2]) return 'article';
	if (relativeSegments[1] === 'search') return 'search';
	return null;
}

function decodeStateFromCurrentUrl(routeName = getUrlRouteNameFromLocation()): Promise<BrowserHistoryEntry> {
	if (routeName === 'article') return new UrlStateParserArticle().get();
	return new UrlStateParserSearch().get();
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

function toRouterPath(url: string): string {
	const context = (CONTEXT_URL || '').replace(/\/+$/, '');
	if (!context || !url.startsWith(context)) {
		return url;
	}
	const relative = url.slice(context.length);
	return relative.length ? relative : '/';
}

function isNavigationDuplicated(err: unknown): boolean {
	if (!err || typeof err !== 'object') {
		return false;
	}
	const maybeError = err as { name?: string; message?: string };
	return maybeError.name === 'NavigationDuplicated' || (maybeError.message || '').includes('Avoided redundant navigation');
}

async function pushUrlWithHistoryState(router: Router, url: string, state: BrowserHistoryEntry): Promise<void> {
	const target = toRouterPath(url);
	try {
		await router.push(target);
	} catch (e) {
		if (!isNavigationDuplicated(e)) {
			throw e;
		}
	}

	const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
	history.replaceState(
		{
			...existingState,
			[HISTORY_STATE_KEY]: state,
		},
		'',
		undefined,
	);
}

function currentUrlWithoutOrigin(): string {
	return new URI().host('').protocol('').port('').toString().replace(/\/+$/, '');
}

function getSearchfieldForUrl(): string | null {
	try {
		return QueryStore.get.sourceField().id;
	} catch {
		return null;
	}
}

function toUrlPayload(v: QueryState): QueryState & { isTruncated: boolean; url: string } {
	const full = stateToUrl({
		contextUrl: CONTEXT_URL,
		indexId: v.indexId,
		params: v.params,
		pattern: QueryStore.get.patternString(),
		gapValue: QueryStore.getState().gap?.value || null,
		searchfield: getSearchfieldForUrl(),
		article: v.article,
		state: v.state,
	});
	return {
		url: full.url,
		isTruncated: full.isTruncated,
		state: v.state,
		params: v.params,
		article: v.article,
	};
}

function shouldPushUrl(v: QueryState & { isTruncated: boolean; url: string }): boolean {
	if (currentUrlWithoutOrigin() !== v.url) {
		return true;
	}
	if (!v.isTruncated) {
		return false;
	}

	const lastState = getStoredHistoryEntry(history.state);
	if (lastState == null) {
		return false;
	}
	if (!lastState.interface || !lastState.patterns || !lastState.gap) {
		return true;
	}

	return (
		jsonStableStringify({ formState: v.state.query.formState, gap: v.state.query.gap }) !==
		jsonStableStringify({ formState: lastState.patterns[lastState.interface.patternMode], gap: lastState.gap })
	);
}

function toBrowserHistoryEntry(v: QueryState & { url: string }): QueryState & { entry: BrowserHistoryEntry; url: string } {
	const { query, views, global } = v.state;
	const activeView = v.state.interface.viewedResults ? views[v.state.interface.viewedResults] : undefined;
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
			viewedResults: v.state.interface.viewedResults,
			activeAnnotationTab: v.state.interface.activeAnnotationTab,
			activeFilterTab: v.state.interface.activeFilterTab,
		},
		gap: query.gap || GapStore.defaults,
		article: v.article || undefined,
	};
	return {
		indexId: v.indexId,
		url: v.url,
		entry,
		state: v.state,
		params: v.params,
		article: v.article,
	};
}

function addQueryHistoryEntry(v: QueryState & { entry: BrowserHistoryEntry; url: string }) {
	const entryForQueryHistory: HistoryStore.HistoryEntry = {
		filters: v.entry.filters,
		global: v.entry.global,
		view: v.entry.view,
		explore: v.entry.explore,
		patterns: v.entry.patterns,
		interface: v.entry.interface,
		gap: v.entry.gap,
	};
	HistoryStore.actions.addEntry({
		entry: entryForQueryHistory,
		pattern: v.params && v.params.patt,
		url: v.url,
	});
}

function createStoreToUrlSubscription(router: Router) {
	return urlInputParameters$
		.pipe(map(toUrlPayload), filter(shouldPushUrl), map(toBrowserHistoryEntry))
		.subscribe(v => {
			debugLog('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', v.url, v.entry);
			addQueryHistoryEntry(v);
			debugLog('history', `Calling router.push (then replaceState) with entry:`, v.entry, `and url:`, v.url);
			pushUrlWithHistoryState(router, v.url, v.entry).catch(e => {
				console.error('Failed to push URL through router', e);
			});
		});
}

function startStoreToUrlReflection(router: Router, initialUrlStateApplied: Promise<void>) {
	if (stopStoreToUrlReflectionHandle) {
		return stopStoreToUrlReflectionHandle;
	}

	debugLog('init', 'Begin attaching store to URL reflection.');

	let stopped = false;
	let reflectionReady = false;
	let latestManagedState: QueryState | null = null;
	const corpus = useCorpus({ IAcknowledgeItCanBeUndefined: true });

	const storeToUrlSubscription = createStoreToUrlSubscription(router);
	const stopWatch = watch(
		(): SyncWatchState => ({
			routeName: getRouteName(router.currentRoute.value),
			indexId: corpus.value?.id,
			params: RootStore.get.blacklabParameters(),
			article: getArticleUrlStateFromRoute(router.currentRoute.value),
			state: {
				views: ViewStore.getState(),
				global: GlobalResultsStore.getState(),
				interface: InterfaceStore.getState(),
				query: QueryStore.getState(),
			},
		}),
		cur => {
			if (!isUrlManagedRoute(cur.routeName) || !cur.indexId) {
				latestManagedState = null;
				return;
			}

			latestManagedState = cloneDeep({
				indexId: cur.indexId,
				params: cur.params,
				article: cur.article,
				state: cur.state,
			});

			if (reflectionReady) {
				urlInputParameters$.next(cloneDeep(latestManagedState));
			}
		},
		{
			immediate: true,
			deep: true,
		},
	);

	void initialUrlStateApplied.then(() => {
		if (stopped) {
			return;
		}

		reflectionReady = true;
		if (latestManagedState) {
			urlInputParameters$.next(cloneDeep(latestManagedState));
		}
	});

	stopStoreToUrlReflectionHandle = () => {
		stopped = true;
		stopWatch();
		storeToUrlSubscription.unsubscribe();
		stopStoreToUrlReflectionHandle = null;
		debugLog('init', 'Stopped store to URL reflection.');
	};

	return stopStoreToUrlReflectionHandle;
}

async function restoreCurrentUrlState(router: Router) {
	const routeName = getRouteName(router.currentRoute.value);
	if (!isUrlManagedRoute(routeName)) {
		return;
	}

	try {
		RootStore.actions.replace(await decodeStateFromCurrentUrl(routeName));
	} catch (e) {
		console.error('Failed to restore URL state', e);
	}
}

function applyInitialUrlStateWhenStoreIsReady(router: Router): Promise<void> {
	if (initialUrlStateAppliedPromise) {
		return initialUrlStateAppliedPromise;
	}

	initialUrlStateAppliedPromise = new Promise<void>(resolve => {
		const loadingState = RootStore.get.loadingState();
		if (loadingState.value.isLoaded()) {
			void restoreCurrentUrlState(router).finally(resolve);
			return;
		}

		const stop = watch(
			() => loadingState.value,
			state => {
				if (!state.isLoaded()) {
					return;
				}

				stop();
				void restoreCurrentUrlState(router).finally(resolve);
			},
		);
	});

	return initialUrlStateAppliedPromise;
}

function startBrowserHistoryRestore() {
	if (stopBrowserHistoryRestoreHandle) {
		return stopBrowserHistoryRestoreHandle;
	}

	debugLog('init', 'Begin attaching browser history restore.');
	const historyRestoreSubscription = fromEvent<PopStateEvent>(window, 'popstate')
		.pipe(
			mergeMap(evt => {
				const fromState = getStoredHistoryEntry(evt.state);
				if (fromState) return of(fromState);

				const routeName = getUrlRouteNameFromLocation();
				return routeName ? decodeStateFromCurrentUrl(routeName) : EMPTY;
			}),
		)
		.subscribe(state => RootStore.actions.replace(state));

	stopBrowserHistoryRestoreHandle = () => {
		historyRestoreSubscription.unsubscribe();
		stopBrowserHistoryRestoreHandle = null;
		debugLog('init', 'Stopped browser history restore.');
	};

	return stopBrowserHistoryRestoreHandle;
}

export default function startUrlSync(router: Router) {
	const initialUrlStateApplied = applyInitialUrlStateWhenStoreIsReady(router);
	const stopStoreToUrl = startStoreToUrlReflection(router, initialUrlStateApplied);
	const stopHistoryRestore = startBrowserHistoryRestore();

	return () => {
		stopStoreToUrl();
		stopHistoryRestore();
	};
}
