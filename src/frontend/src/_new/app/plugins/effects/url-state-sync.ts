// // Define a few pipelines to perform actions on streams of data
// import URI from 'urijs';

// import cloneDeep from 'clone-deep';
// import { ReplaySubject } from 'rxjs';
// import { filter, map } from 'rxjs/operators';

// import type * as ArticleStore from '@/features/article/model/article-state';
// import * as HistoryStore from '@/features/history/model/query-history-state';
// import * as ExploreStore from '@/features/search/model/form/explore-state';
// import * as GapStore from '@/features/search/model/form/gap-state';
// import type * as InterfaceStore from '@/features/search/model/form/interface-state';
// import * as PatternStore from '@/features/search/model/form/pattern-state';
// import * as QueryStore from '@/features/search/model/query-state';
// import type * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
// import * as ViewStore from '@/features/search/model/results/view-state';

// import { stateToUrl } from '@/_new/app/routes/urls/state-to-url';
// import UrlStateParserArticle from '@/_new/app/routes/urls/url-state-parser-article';
// import UrlStateParserSearch from '@/_new/app/routes/urls/url-state-parser-search';

// import { debugLogCat } from '@/_new/app/features/debug/debug';
// import type * as BLTypes from '@/_new/types/blacklabtypes';
// import jsonStableStringify from 'json-stable-stringify';
// import { useRouter } from 'vue-router';

// type QueryState = {
// 	indexId?: string|null,
// 	params?: BLTypes.BLSearchParameters,
// 	state: {
// 		query: QueryStore.ModuleRootState,
// 		interface: InterfaceStore.ModuleRootState,
// 		global: GlobalResultsStore.ModuleRootState,
// 		views: ViewStore.ModuleRootState,
// 		article: ArticleStore.ModuleRootState,
// 	}
// };

// type BrowserHistoryEntry = HistoryStore.HistoryEntry&{article: ArticleStore.HistoryState};
// const HISTORY_STATE_KEY = 'cfHistoryState';

// const urlInputParameters$ = new ReplaySubject<QueryState>(1);
// let stopStoreToUrlReflectionHandle: (() => void)|null = null;
// let stopBrowserHistoryRestoreHandle: (() => void)|null = null;

// type UrlManagedRouteName = 'search'|'article';
// type SyncWatchState = QueryState&{routeName: string|null};

// function isUrlManagedRoute(routeName: string|null): routeName is UrlManagedRouteName {
// 	return routeName === 'search' || routeName === 'article';
// }

// function decodeStateFromCurrentUrl(): Promise<HistoryStore.HistoryEntry&{article: ArticleStore.HistoryState}> {
// 	const pathSegments = new URI().segmentCoded().filter(s => !!s);
// 	const contextSegments = new URI(CONTEXT_URL).segmentCoded().filter(s => !!s);
// 	const relativeSegments = pathSegments.slice(contextSegments.length);
// 	const isArticleRoute = relativeSegments[1] === 'docs' && !!relativeSegments[2];
// 	return (isArticleRoute ? new UrlStateParserArticle() : new UrlStateParserSearch()).get();
// }

// function getStoredHistoryEntry(state: unknown): BrowserHistoryEntry|null {
// 	if (!state || typeof state !== 'object') {
// 		return null;
// 	}
// 	const typed = state as Record<string, unknown>;
// 	const nested = typed[HISTORY_STATE_KEY] as BrowserHistoryEntry|undefined;
// 	if (nested && typeof nested === 'object') {
// 		return nested;
// 	}
// 	if ('interface' in typed && 'patterns' in typed) {
// 		return typed as unknown as BrowserHistoryEntry;
// 	}
// 	return null;
// }

// function toRouterPath(url: string): string {
// 	const context = (CONTEXT_URL || '').replace(/\/+$/, '');
// 	if (!context || !url.startsWith(context)) {
// 		return url;
// 	}
// 	const relative = url.slice(context.length);
// 	return relative.length ? relative : '/';
// }

// function isNavigationDuplicated(err: unknown): boolean {
// 	if (!err || typeof err !== 'object') {
// 		return false;
// 	}
// 	const maybeError = err as {name?: string, message?: string};
// 	return maybeError.name === 'NavigationDuplicated' || (maybeError.message || '').includes('Avoided redundant navigation');
// }

// async function pushUrlWithHistoryState(url: string, state: BrowserHistoryEntry): Promise<void> {
// 	const router = useRouter();
// 	const target = toRouterPath(url);
// 	try {
// 		await router.push(target);
// 	} catch (e) {
// 		if (!isNavigationDuplicated(e)) {
// 			throw e;
// 		}
// 	}

// 	const existingState = (history.state && typeof history.state === 'object') ? history.state as Record<string, unknown> : {};
// 	history.replaceState({
// 		...existingState,
// 		[HISTORY_STATE_KEY]: state,
// 	}, '', undefined);
// }

// function createStoreToUrlSubscription() {
// 	return urlInputParameters$.pipe(
// 		map<QueryState, QueryState&{
// 			isTruncated: boolean;
// 			url: string;
// 		}>(v => {
// 			const full = stateToUrl({
// 				contextUrl: CONTEXT_URL,
// 				indexId: v.indexId,
// 				params: v.params,
// 				pattern: QueryStore.get.patternString(),
// 				gapValue: QueryStore.getState().gap?.value || null,
// 				searchField: QueryStore.get.sourceField().id,
// 				state: v.state,
// 			});
// 			return {
// 				url: full.url,
// 				isTruncated: full.isTruncated,
// 				state: v.state,
// 				params: v.params
// 			};
// 		}),
// 		filter(v => {
// 			const curUrl = new URI().host('').protocol('').port('').toString().replace(/\/+$/, '');

// 			if (curUrl !== v.url) {
// 				return true;
// 			} else if (!v.isTruncated) {
// 				return false;
// 			}

// 			const lastState = getStoredHistoryEntry(history.state);
// 			if (lastState == null) {
// 				return false;
// 			}
// 			if (!lastState.interface || !lastState.patterns || !lastState.gap) {
// 				return true;
// 			}

// 			return jsonStableStringify({formState: v.state.query.formState, gap: v.state.query.gap}) !== jsonStableStringify({formState: lastState.patterns[lastState.interface.patternMode], gap: lastState.gap});
// 		}),
// 		map((v): QueryState&{
// 			entry: BrowserHistoryEntry
// 			url: string,
// 		} => {
// 			const {query, views, global} = v.state;
// 			const activeView = v.state.interface.viewedResults ? views[v.state.interface.viewedResults] : undefined;
// 			const entry: BrowserHistoryEntry = {
// 				filters: query.filters || {},
// 				global,
// 				view: activeView || cloneDeep(ViewStore.initialViewState),
// 				explore: query.form === 'explore' ? {
// 					...ExploreStore.defaults,
// 					[query.subForm]: query.formState
// 				} : ExploreStore.defaults,
// 				patterns: query.form === 'search' ? {
// 					...PatternStore.defaults,
// 					[query.subForm]: query.formState,
// 				shared: query.shared,
// 				} : PatternStore.defaults,
// 				interface: {
// 					form: query.form ? query.form : 'search',
// 					exploreMode: query.form === 'explore' ? query.subForm : 'ngram',
// 					patternMode: query.form === 'search' ? query.subForm : 'simple',
// 					viewedResults: v.state.interface.viewedResults,
// 					activeAnnotationTab: v.state.interface.activeAnnotationTab,
// 					activeFilterTab: v.state.interface.activeFilterTab,
// 				},
// 				gap: query.gap || GapStore.defaults,
// 				article: {
// 					docId: v.state.article.docId,
// 					viewField: v.state.article.viewField,
// 					wordstart: v.state.article.wordstart,
// 					wordend: v.state.article.wordend,
// 					findhit: v.state.article.findhit,
// 				},
// 			};
// 			return {
// 				indexId: v.indexId,
// 				url: v.url,
// 				entry,
// 				state: v.state,
// 				params: v.params
// 			};
// 		})
// 	)
// 		.subscribe(v => {
// 			debugLogCat('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', v.url, v.entry);
// 			const entryForQueryHistory: HistoryStore.HistoryEntry = {
// 				filters: v.entry.filters,
// 				global: v.entry.global,
// 				view: v.entry.view,
// 				explore: v.entry.explore,
// 				patterns: v.entry.patterns,
// 				interface: v.entry.interface,
// 				gap: v.entry.gap,
// 			};
// 			HistoryStore.actions.addEntry({
// 				entry: entryForQueryHistory,
// 				pattern: v.params && v.params.patt,
// 				url: v.url
// 			});
// 			debugLogCat('history', `Calling router.push (then replaceState) with entry:`, v.entry, `and url:`, v.url);
// 			pushUrlWithHistoryState(v.url, v.entry).catch(e => {
// 				console.error('Failed to push URL through router', e);
// 			});
// 		});
// }
