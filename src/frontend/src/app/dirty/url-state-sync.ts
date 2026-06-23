import cloneDeep from 'clone-deep';
import jsonStableStringify from 'json-stable-stringify';
import { ReplaySubject, fromEvent, of } from 'rxjs';
import { filter, map, mergeMap } from 'rxjs/operators';
// Define a few pipelines to perform actions on streams of data
import URI from 'urijs';
import { watch } from 'vue';
import type { LocationQueryValue, RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type * as BLTypes from '@/types/blacklabtypes';
import { stateToUrl } from '@/url/state-to-url';
import type { ArticleUrlState } from '@/url/state-to-url';
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
const HISTORY_STATE_KEY = 'cfHistoryState';

const urlInputParameters$ = new ReplaySubject<QueryState>(1);
let stopStoreToUrlReflectionHandle: (() => void) | null = null;
let stopBrowserHistoryRestoreHandle: (() => void) | null = null;

type UrlManagedRouteName = 'search' | 'article';
type SyncWatchState = QueryState & { routeName: string | null };

function isUrlManagedRoute(routeName: string | null): routeName is UrlManagedRouteName {
	return routeName === 'search' || routeName === 'article';
}

function decodeStateFromCurrentUrl(): Promise<BrowserHistoryEntry> {
	const pathSegments = new URI().segmentCoded().filter(s => !!s);
	const contextSegments = new URI(CONTEXT_URL).segmentCoded().filter(s => !!s);
	const relativeSegments = pathSegments.slice(contextSegments.length);
	const isArticleRoute = relativeSegments[1] === 'docs' && !!relativeSegments[2];
	return (isArticleRoute ? new UrlStateParserArticle() : new UrlStateParserSearch()).get();
}

function firstQueryValue(value: LocationQueryValue | LocationQueryValue[]): string | null {
	const raw = Array.isArray(value) ? value[0] : value;
	return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

function getStringFromQuery(route: RouteLocationNormalizedLoaded, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = firstQueryValue(route.query[key]);
		if (value != null) return value;
	}
	return null;
}

function getNumberFromQuery(route: RouteLocationNormalizedLoaded, key: string): number | null {
	const value = getStringFromQuery(route, key);
	if (value == null) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function getArticleUrlStateFromRoute(route: RouteLocationNormalizedLoaded): ArticleUrlState | null {
	if (route.name !== 'article') {
		return null;
	}
	const docId = typeof route.params.docId === 'string' && route.params.docId.length > 0 ? route.params.docId : null;
	if (!docId) {
		return null;
	}
	return {
		docId,
		viewField: getStringFromQuery(route, 'field'),
		wordstart: getNumberFromQuery(route, 'wordstart'),
		wordend: getNumberFromQuery(route, 'wordend'),
		findhit: getNumberFromQuery(route, 'findhit'),
		pattern: getStringFromQuery(route, 'patt', 'query'),
		pattgapdata: getStringFromQuery(route, 'pattgapdata'),
		searchfield: getStringFromQuery(route, 'searchfield', 'searchField', 'field'),
	};
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

function createStoreToUrlSubscription(router: Router) {
	return urlInputParameters$
		.pipe(
			map<
				QueryState,
				QueryState & {
					isTruncated: boolean;
					url: string;
				}
			>(v => {
				const full = stateToUrl({
					contextUrl: CONTEXT_URL,
					indexId: v.indexId,
					params: v.params,
					pattern: QueryStore.get.patternString(),
					gapValue: QueryStore.getState().gap?.value || null,
					searchfield: QueryStore.get.sourceField().id,
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
			}),
			filter(v => {
				const curUrl = new URI().host('').protocol('').port('').toString().replace(/\/+$/, '');

				if (curUrl !== v.url) {
					return true;
				} else if (!v.isTruncated) {
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
			}),
			map(
				(
					v,
				): QueryState & {
					entry: BrowserHistoryEntry;
					url: string;
				} => {
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
				},
			),
		)
		.subscribe(v => {
			debugLog('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', v.url, v.entry);
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

	const storeToUrlSubscription = createStoreToUrlSubscription(router);
	const stopWatch = watch(
		(): SyncWatchState => ({
			routeName: typeof router.currentRoute.value.name === 'string' ? router.currentRoute.value.name : null,
			indexId: CorpusStore.get.indexId(),
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
			if (!isUrlManagedRoute(cur.routeName)) {
				latestManagedState = null;
				return;
			}

			latestManagedState = cloneDeep({
				indexId: cur.indexId,
				params: cur.params,
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

function startBrowserHistoryRestore() {
	if (stopBrowserHistoryRestoreHandle) {
		return stopBrowserHistoryRestoreHandle;
	}

	debugLog('init', 'Begin attaching browser history restore.');
	const historyRestoreSubscription = fromEvent<PopStateEvent>(window, 'popstate')
		.pipe(
			mergeMap(evt => {
				const fromState = getStoredHistoryEntry(evt.state);
				return fromState ? of(fromState) : decodeStateFromCurrentUrl();
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

export default function startUrlSync(router: Router, initialUrlStateApplied: Promise<void>) {
	const stopStoreToUrl = startStoreToUrlReflection(router, initialUrlStateApplied);
	const stopHistoryRestore = startBrowserHistoryRestore();

	return () => {
		stopStoreToUrl();
		stopHistoryRestore();
	};
}
