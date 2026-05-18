// import { useRouteBootstrap } from "@/app/plugins/installRoutePageBootstrapped";
// import { useCurrentCorpusId } from "@/app/plugins/installRouter";
// import * as RootStore from '@/app/state/root-store';
// import * as ArticleStore from '@/features/article/model/article-state';
// import type { HistoryEntry } from "@/features/history/model/query-history-state";
// import * as ExploreStore from '@/features/search/model/form/explore-state';
// import * as GapStore from '@/features/search/model/form/gap-state';
// import * as InterfaceStore from '@/features/search/model/form/interface-state';
// import * as PatternStore from '@/features/search/model/form/pattern-state';
// import * as QueryStore from '@/features/search/model/query-state';
// import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
// import * as ViewStore from '@/features/search/model/results/view-state';
// import { articleStateToUrl, searchStateToUrl, type UrlTransformOutput } from "@/app/routes/urls/state-to-url";
// import UrlStateParserArticle from "@/app/routes/urls/url-state-parser-article";
// import UrlStateParserSearch from "@/app/routes/urls/url-state-parser-search";
// import { debugLogCat } from "@/app/features/debug/debug";
// import { getPatternString, getPatternStringSearch } from "@/utils/pattern-utils";
// import cloneDeep from "clone-deep";
// import { fromEvent, mergeMap, of } from "rxjs";
// import { computed, watch, watchEffect } from "vue";
// import { useRouter } from "vue-router";

// let initialUrlStateApplied = false;

// function getStateFromUrl(name: 'search'|'article'|string&{}): Promise<HistoryEntry&{article: ArticleStore.HistoryState}|null> {
// 	const fromUrl = history.state;
// 	if (fromUrl) return fromUrl;

// 	if (name === 'search') return new UrlStateParserSearch().get();
// 	else if (name === 'article') return new UrlStateParserArticle().get();
// 	else return Promise.resolve(null);
// }

// function searchUrl(indexId: string, state: HistoryEntry): string {
// 	if (!state.interface.viewedResults) return `${CONTEXT_URL}/${indexId}/search`;

// 	return `${CONTEXT_URL}/${indexId}/search/${state.interface.viewedResults}?${
// 		new URLSearchParams({
// 			patt: getPatternString(state.§)
// 		})
// 		.toString()
// 	}`;
// }

// export function startStoreToUrlReflection() {
// 	const routeBootstrap = useRouteBootstrap();
// 	const indexId = useCurrentCorpusId();
// 	const router = useRouter();

// 	let nonce = 0;
// 	watchEffect(async () => {
// 		const shouldStartDecode = routeBootstrap.pageBootstrapped.value && !routeBootstrap.pageUrlParsed.value;
// 		if (!shouldStartDecode) return;
// 		const localNonce = ++nonce;

// 		const stateFromUrl = await getStateFromUrl(routeBootstrap.pageName.value);
// 		if (localNonce !== nonce) return; // stale already
// 		if (stateFromUrl) RootStore.actions.replace(stateFromUrl);
// 		routeBootstrap.pageUrlParsed.value = true;
// 	})

// 	const searchHistoryEntry = computed<HistoryEntry>(() => {
// 		const activeViewName = InterfaceStore.get.viewedResults();
// 		const activeViewState = activeViewName ? ViewStore.getState()[activeViewName] : ViewStore.initialViewState;
// 		const query = QueryStore.getState();

// 		const r: HistoryEntry = {
// 			filters: QueryStore.getState().filters || {},
// 			global: GlobalResultsStore.getState(),
// 			view: activeViewState,
// 			explore: query.form === 'explore' ? {
// 				...ExploreStore.defaults,
// 				[query.subForm]: query.formState
// 			} : ExploreStore.defaults,
// 			patterns: query.form === 'search' ? {
// 				...PatternStore.defaults,
// 				[query.subForm]: query.formState,
// 				shared: query.shared,
// 			} : PatternStore.defaults,
// 			interface: {
// 				form: query.form ? query.form : 'search',
// 				exploreMode: query.form === 'explore' ? query.subForm : 'ngram',
// 				patternMode: query.form === 'search' ? query.subForm : 'simple',
// 				viewedResults: InterfaceStore.get.viewedResults(),
// 				activeAnnotationTab: InterfaceStore.get.activeAnnotationTab(),
// 				activeFilterTab: InterfaceStore.get.activeFilterTab(),
// 			},
// 			gap: query.gap || GapStore.defaults,
// 		}
// 		return r;
// 	})

// 	type ArticleNonPathState = Omit<ArticleStore.ModuleRootState, 'docId'>;
// 	const articleHistoryEntry = computed<ArticleNonPathState>(() => {
// 		const {docId, ...rest} = ArticleStore.getState();
// 		return rest;
// 	});

// 	watchEffect(async () => {
// 		// wait for initial setup before starting sync in the other direction
// 		if (!routeBootstrap.pageUrlParsed.value) return;

// 		let url: ReturnType<typeof searchStateToUrl>|undefined;
// 		if (routeBootstrap.pageName.value === 'search') {
// 			url = searchStateToUrl(getRelevantSearchState());
// 		} else if (routeBootstrap.pageName.value === 'article') {
// 			url = articleStateToUrl(getRelevantArticleState());
// 		}

// 		if (!url || url.url === window.location.pathname + window.location.search + window.location.hash)
// 			return; // No url, or already in sync, no need to push a new state and mess with the browser history

// 		window.history.replaceState(url.state, '', url.url);
// 	});

// 	watch(() => ({
// 		pageName: routeBootstrap.pageName.value,
// 		isLoaded: routeBootstrap.pageBootstrapped.value,
// 	}), async (cur, prev) => {
// 		if (cur === prev) return;

// 		if (!cur.isLoaded) return; // wait for essentials to load
// 		const localNonce = ++nonce;

// 		const stateFromUrl = await getStateFromUrl(cur.pageName);
// 		if (localNonce !== nonce || !stateFromUrl) return;
// 		RootStore.actions.replace(stateFromUrl);
// 		mode.value = 'storeToUrl';
// 	}, {immediate: true});

// 	const urlStateInput = computed(() => structuredClone({
// 		contextUrl: CONTEXT_URL,
// 		indexId: indexId.value!,
// 		params: RootStore.get.blacklabParameters(),
// 		pattern: QueryStore.get.patternString(),
// 		gapValue: QueryStore.getState().gap?.value || null,
// 		searchField: QueryStore.get.sourceField().id,
// 		state: {
// 			article: ArticleStore.getState(),
// 			global: GlobalResultsStore.getState(),
// 			interface: InterfaceStore.getState(),
// 			query: QueryStore.getState(),
// 			views: ViewStore.getState(),
// 		}
// 	}));

// 	// start the inverse now.
// 	const desiredUrl = computed<null|UrlTransformOutput&{state: HistoryEntry&{article: ArticleStore.HistoryState}}>(() => {
// 		if (routeBootstrap.pageName.value === 'search') return {
// 			...searchStateToUrl(urlStateInput.value),
// 			state: urlStateInput.value
// 		};
// 		else if (routeBootstrap.pageName.value === 'article') return {
// 			...articleStateToUrl(urlStateInput.value),
// 			state: urlStateInput.value
// 		};
// 		return null;
// 	})

// 	watch(desiredUrl, (cur) => {
// 		if (mode.value !== 'storeToUrl') return;
// 		if (!cur) return;
// 		if (cur.fullUrl !== window.location.pathname + window.location.search + window.location.hash) {
// 			window.history.pushState(cur.state, '', cur.url);
// 		}
// 	}, {immediate: true});

// 	const storeToUrlSubscription = createStoreToUrlSubscription();
// 	const stopWatch = watch(
// 		(): SyncWatchState => ({
// 			routeName: typeof router.currentRoute.value.name === 'string' ? router.currentRoute.value.name : null,
// 			indexId: CorpusStore.get.indexId(),
// 			params: RootStore.get.blacklabParameters(),
// 			state: {
// 				views: ViewStore.getState(),
// 				global: GlobalResultsStore.getState(),
// 				article: ArticleStore.getState(),
// 				interface: InterfaceStore.getState(),
// 				query: QueryStore.getState()
// 			}
// 		}),
// 		(cur) => {
// 			if (!isUrlManagedRoute(cur.routeName)) {
// 				latestManagedState = null;
// 				return;
// 			}

// 			latestManagedState = cloneDeep({
// 				indexId: cur.indexId,
// 				params: cur.params,
// 				state: cur.state,
// 			});

// 			if (reflectionReady) {
// 				urlInputParameters$.next(cloneDeep(latestManagedState));
// 			}
// 		},
// 		{
// 			immediate: true,
// 			deep: true
// 		}
// 	);

// 	void initialUrlStateApplied.then(() => {
// 		if (stopped) {
// 			return;
// 		}

// 		reflectionReady = true;
// 		if (latestManagedState) {
// 			urlInputParameters$.next(cloneDeep(latestManagedState));
// 		}
// 	});

// 	stopStoreToUrlReflectionHandle = () => {
// 		stopped = true;
// 		stopWatch();
// 		storeToUrlSubscription.unsubscribe();
// 		stopStoreToUrlReflectionHandle = null;
// 		debugLogCat('init', 'Stopped store to URL reflection.');
// 	};

// 	return stopStoreToUrlReflectionHandle;
// }

// export function startBrowserHistoryRestore() {
// 	if (stopBrowserHistoryRestoreHandle) {
// 		return stopBrowserHistoryRestoreHandle;
// 	}

// 	debugLogCat('init', 'Begin attaching browser history restore.');
// 	const historyRestoreSubscription = fromEvent<PopStateEvent>(window, 'popstate')
// 		.pipe(mergeMap(evt => {
// 			const fromState = getStoredHistoryEntry(evt.state);
// 			return fromState ? of(fromState) : decodeStateFromCurrentUrl();
// 		}))
// 		.subscribe(state => RootStore.actions.replace(state));

// 	stopBrowserHistoryRestoreHandle = () => {
// 		historyRestoreSubscription.unsubscribe();
// 		stopBrowserHistoryRestoreHandle = null;
// 		debugLogCat('init', 'Stopped browser history restore.');
// 	};

// 	return stopBrowserHistoryRestoreHandle;
// }

// export default () => {
// 	const stopStoreToUrl = startStoreToUrlReflection();
// 	const stopHistoryRestore = startBrowserHistoryRestore();

// 	return () => {
// 		stopStoreToUrl();
// 		stopHistoryRestore();
// 	};
// };
