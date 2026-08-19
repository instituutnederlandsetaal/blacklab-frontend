import cloneDeep from 'clone-deep';
import { computed, watch, type Ref } from 'vue';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { Customizations } from '@/customization-api/internal/internal-api';
import { compileFormNode, restoreFormState, type FormRuntime } from '@/features/form';
import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type { PageMeta } from '@/navigation/page-context';
import type { Corpus } from '@/types/apptypes';
import { getSubmittedInterfaceState, type SearchPageQueryParamsInput } from '@/url/state-to-url';
import UrlStateParserSearch, { createUrlStateParserSearchDependencies } from '@/url/url-state-parser-search';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { cleanQueryParams } from '@/shared/api/lib/api-utils';
import { debugLog } from '@/shared/debug/debug';
import type { LoadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';
import { stableStringify } from '@/shared/utils/stable-stringify';

type QueryState = {
	query: QueryStore.ModuleRootState;
	interface: InterfaceStore.ModuleRootState;
	global: GlobalResultsStore.ModuleRootState;
	views: ViewStore.ModuleRootState;
};

type UrlManagedRouteName = 'search' | 'article';
type UrlStateSyncDependencies = {
	blacklabApi: BlackLabApi;
	corpusContext: LoadableFromRequest<CorpusContext>;
	indexId: Ref<string | undefined>;
	pageMeta: Ref<PageMeta | null>;
	searchForms: Ref<FormRuntime | null>;
	customizations: Customizations;
	beforeStateLoaded: () => Promise<unknown>;
};

/** Key under which we store the state snapshot in the browser history API's state object */
const HISTORY_STATE_KEY = 'cfHistoryState';
// Non-reactive race guard for async URL restores; each closure keeps the value it started with.
let urlRestoreRevision = 0;

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

type FrontendSearchPageExtraQueryParamsDecoded = {
	interface?: Partial<InterfaceStore.ModuleRootState>;
	groupDisplayMode?: string;
	resultViewCustomState?: unknown;
};
type FrontendSearchPageExtraQueryParamsEncoded = Partial<Record<keyof FrontendSearchPageExtraQueryParamsDecoded, string>>;

type NavigationInput = {
	/** The query params that represent submitted query/results state. Draft interface params are sampled only while pushing. */
	query: Partial<BlackLabParameters & FrontendSearchPageExtraQueryParamsEncoded>;
	/** Path in the url, starts with a / */
	path: string;
	/** Vue Router route path, without the history base. Used only for store/router equality checks. */
	routePath: string;

	indexId: string;
	resultsView: string | null;
};

type RealSearchPageQueryParamsInput = Omit<SearchPageQueryParamsInput, 'interface'>;
type AdditionalSearchPageQueryParamsInput = Pick<SearchPageQueryParamsInput, 'query' | 'interface'>;

function createRealBrowserQueryParams(p: RealSearchPageQueryParamsInput): NavigationInput['query'] {
	const { blacklabParams, query, view } = p;
	const viewQueryParams: FrontendSearchPageExtraQueryParamsEncoded = {
		resultViewCustomState: view?.customState ? JSON.stringify(view.customState) : undefined,
		groupDisplayMode: view?.groupDisplayMode || undefined,
	};

	const scopedFormState = query.form === 'new' ? query.state.encoded : undefined;

	return (
		cleanQueryParams({
			// we just mimic blacklab's query parameters for most of our interface state
			...blacklabParams,

			// fix up first/number to be our frontend pagination numbers
			first: view?.first != null ? String(view.first) : undefined,
			number: view?.number != null ? String(view.number) : undefined,

			...viewQueryParams,
			...scopedFormState,
		}) ?? {}
	);
}

function createAdditionalBrowserQueryParams(p: AdditionalSearchPageQueryParamsInput): NavigationInput['query'] {
	if (!p.interface.viewedResults) return {};
	const submittedInterfaceState = getSubmittedInterfaceState(p);
	if (!submittedInterfaceState) return {};
	return (
		cleanQueryParams({
			interface: JSON.stringify(submittedInterfaceState),
		}) ?? {}
	);
}

function createBrowserHistoryEntry(value: QueryState): HistoryStore.HistoryEntry {
	const { query, views, global, interface: interfaceState } = value;

	// contains defaults for all the properties that are not considered 'active' through the interface state
	return {
		filters: query.form === 'new' ? {} : query.filters || {},
		global,
		view: interfaceState.viewedResults ? views[interfaceState.viewedResults] : ViewStore.initialViewState,
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
		newForm: query.form === 'new' ? query.state : null,
		interface:
			query.form === 'new'
				? { ...interfaceState }
				: {
						form: query.form ?? 'search',
						exploreMode: query.form === 'explore' ? query.subForm : 'ngram',
						patternMode: query.form === 'search' ? query.subForm : 'simple',
						viewedResults: interfaceState.viewedResults,
						activeAnnotationTab: interfaceState.activeAnnotationTab,
						activeFilterTab: interfaceState.activeFilterTab,
					},
		gap: query.form === 'new' ? GapStore.defaults : query.gap || GapStore.defaults,
	};
}

function createCurrentBrowserHistoryEntry(resultsView: string | null): HistoryStore.HistoryEntry | null {
	if (!resultsView) return null;
	return cloneDeep(
		createBrowserHistoryEntry({
			global: GlobalResultsStore.getState(),
			interface: InterfaceStore.getState(),
			query: QueryStore.getState(),
			views: ViewStore.getState(),
		}),
	);
}

function pushStoreStateToRouter(router: Router, next: NavigationInput) {
	const { path, indexId, resultsView } = next;
	const query =
		cleanQueryParams({
			...next.query,
			...createAdditionalBrowserQueryParams({
				interface: InterfaceStore.getState(),
				query: QueryStore.getState(),
			}),
		}) ?? {};
	const entry = createCurrentBrowserHistoryEntry(resultsView);
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		for (const item of Array.isArray(value) ? value : [value]) {
			if (item != null) searchParams.append(key, String(item));
		}
	}
	const queryString = searchParams.toString();
	const url = queryString ? `${path}?${queryString}` : path;
	if (entry) {
		HistoryStore.actions.addEntry({
			entry,
			pattern: query.patt || undefined,
			url,
		});
	}

	const historyState = entry ? { [HISTORY_STATE_KEY]: entry as any } : null;

	debugLog('history', 'Adding/updating query in query history, adding browser history entry, and reporting to ga', url, entry);
	debugLog('history', `Calling router.push with entry:`, entry, `and url:`, url);

	router
		.push({
			query: query,
			name: 'search',
			params: {
				corpus: indexId,
				...(resultsView ? { results: resultsView } : {}),
			},
			// NOTE: doesn't actually work?
			// also trying to read it out in the .then() doesn't work, as the property is missing.
			// see https://github.com/vuejs/rfcs/discussions/400
			state: historyState ?? undefined,
		})
		.then(
			() => {
				const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
				if (historyState) history.replaceState({ ...existingState, ...historyState }, '', undefined);
				else {
					delete existingState[HISTORY_STATE_KEY];
					history.replaceState(existingState, '', undefined);
				}
			},
			e => {
				const maybeError = e as { name?: string; message?: string } | null;
				if (maybeError?.name === 'NavigationDuplicated' || (maybeError?.message || '').includes('Avoided redundant navigation')) {
					const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
					if (historyState) history.replaceState({ ...existingState, ...historyState }, '', undefined);
					else {
						delete existingState[HISTORY_STATE_KEY];
						history.replaceState(existingState, '', undefined);
					}
					return;
				}
				console.error('Failed to push URL through router', e);
			},
		);
}

function createUrlForComparison(path: string, query: Record<string, any>, ignoredQueryKeys: ReadonlySet<string> = new Set()): string {
	const normalizedQuery = Object.fromEntries(
		Object.entries(query)
			.filter(([key]) => !ignoredQueryKeys.has(key))
			.map(([key, value]) => {
				const values = (Array.isArray(value) ? value : [value])
					.filter(value => value != null && value !== '')
					.map(String)
					.sort();
				return values.length ? [key, values.length === 1 ? values[0] : values] : null;
			})
			.filter((entry): entry is [string, string | string[]] => entry != null),
	);
	return stableStringify({ path, query: normalizedQuery });
}

// The legacy interface param contains draft tab/form state; it is sampled on push, but must not arbitrate direction.
const DRAFT_URL_QUERY_KEYS = new Set(['interface']);

export default function startUrlSync(router: Router, dependencies: UrlStateSyncDependencies) {
	let initialUrlReadStarted = false;
	let initialUrlReadComplete = false;
	const loadedCorpus = computed<Corpus | null>(() => (dependencies.corpusContext.isLoaded() ? dependencies.corpusContext.value.index || null : null));

	function getUrlSyncContext(): UrlSyncContext | null {
		const route = router.currentRoute.value;
		const routeName = getManagedRouteName(dependencies.pageMeta.value, route);
		const corpus = loadedCorpus.value;
		const indexId = dependencies.indexId.value;
		return routeName && corpus && indexId ? { routeName, route, corpus, indexId } : null;
	}

	const routerUrl = computed(() => {
		const context = getUrlSyncContext();
		return context ? createUrlForComparison(context.route.path, context.route.query, DRAFT_URL_QUERY_KEYS) : null;
	});

	const storeUrlInput = computed<NavigationInput | null>(() => {
		const context = getUrlSyncContext();
		if (!context) return null;
		const viewedResults = InterfaceStore.get.viewedResults();

		const basePath = CONTEXT_URL + '/' + encodeURIComponent(context.indexId) + '/search' + (viewedResults ? '/' + encodeURIComponent(viewedResults) : '');
		const { pathname, hash, search } = new URL(basePath, window.location.origin);
		const newUrl = pathname + search + hash;
		const routePath = router.resolve({
			name: 'search',
			params: {
				corpus: context.indexId,
				...(viewedResults ? { results: viewedResults } : {}),
			},
		}).path;

		if (!viewedResults) {
			return {
				query: {},
				path: newUrl,
				routePath,
				indexId: context.indexId,
				resultsView: null,
			} satisfies NavigationInput;
		}

		return {
			query: createRealBrowserQueryParams({
				blacklabParams: RootStore.get.blacklabParameters()!,
				query: QueryStore.getState(),
				view: ViewStore.getState()[viewedResults],
			}),
			path: newUrl,
			routePath,
			indexId: context.indexId,
			resultsView: viewedResults,
		} satisfies NavigationInput;
	});

	const storeUrl = computed(() => (storeUrlInput.value ? createUrlForComparison(storeUrlInput.value.routePath, storeUrlInput.value.query) : null));

	async function applyRouterUrlToStore(context: UrlSyncContext, restoreRevision: number) {
		if (context.routeName !== 'search') {
			return;
		}
		const localSearchIntentRevision = RootStore.get.localSearchIntentRevision();

		try {
			await dependencies.beforeStateLoaded();
			const restoredFromHistory = history.state?.[HISTORY_STATE_KEY] as HistoryStore.HistoryEntry | undefined;
			const restored =
				restoredFromHistory ??
				(await new UrlStateParserSearch(
					createUrlStateParserSearchDependencies({
						blacklabApi: dependencies.blacklabApi,
						corpus: context.corpus,
						customizations: dependencies.customizations,
					}),
				).get());

			if (restoreRevision !== urlRestoreRevision) return;
			if (RootStore.get.localSearchIntentRevision() !== localSearchIntentRevision) {
				debugLog('history', 'Skipping stale URL restore because a local search action ran while URL state was loading.', context.route.fullPath);
				return;
			}

			debugLog('history', restoredFromHistory ? 'Restoring state from browser history.' : 'Restoring state from URL.', context.route.fullPath);

			// Now sync with form system (which doesn't run through store)
			const newSearchFormRuntime = dependencies.searchForms.value;
			let submittedNewForm = restored.newForm ?? null;
			if (newSearchFormRuntime) {
				const newFormState = restoreFormState(newSearchFormRuntime.definition, context.route.query);
				if (newFormState.submittedFormId) {
					const form = newSearchFormRuntime.definition.getForm(newFormState.submittedFormId);
					if (!form) throw new Error(`Cannot compile unknown restored form '${newFormState.submittedFormId}'.`);
					submittedNewForm = compileFormNode(form, newFormState, newSearchFormRuntime.definition.context);
				}
				newSearchFormRuntime.state.replaceState(newFormState);
				if (newFormState.issues.length) {
					debugLog('url', 'New search form URL restore issues', newFormState.issues);
				}
			}

			const restoredForStore = { ...restored, newForm: submittedNewForm };
			RootStore.actions.replace(restoredForStore);

			// Initial URL restores need their decoded state in history.state without going through a reactive self-push.
			const existingState = history.state && typeof history.state === 'object' ? (history.state as Record<string, unknown>) : {};
			const entry = createCurrentBrowserHistoryEntry(restoredForStore.interface.viewedResults) ?? (restoredForStore.interface.viewedResults ? restoredForStore : null);
			if (entry) history.replaceState({ ...existingState, [HISTORY_STATE_KEY]: cloneDeep(entry) as any }, '', undefined);
			else {
				delete existingState[HISTORY_STATE_KEY];
				history.replaceState(existingState, '', undefined);
			}
		} catch (e) {
			console.error('Failed to restore URL state', e);
			return;
		}
	}

	const stopUrlSync = watch(
		() => [routerUrl.value, storeUrl.value, dependencies.searchForms.value] as const,
		async (current, previous) => {
			const context = getUrlSyncContext();
			const [currentRouterUrl, currentStoreUrl, currentSearchForms] = current;
			const [previousRouterUrl, previousStoreUrl, previousSearchForms] = previous ?? [null, null, null];
			const formDefinitionChanged = currentSearchForms?.definition !== previousSearchForms?.definition;
			if (!context || !currentRouterUrl || (currentRouterUrl === currentStoreUrl && !formDefinitionChanged)) return;

			const routerChanged = currentRouterUrl !== previousRouterUrl;
			const storeChanged = currentStoreUrl !== previousStoreUrl;
			if (!routerChanged && !storeChanged && !formDefinitionChanged) return;
			// The in-flight initial read installs into the latest runtime after parsing.
			// Restarting it for setup-time definition changes only creates duplicate work
			// and can invalidate the restore that is already about to populate the form.
			if (formDefinitionChanged && initialUrlReadStarted && !initialUrlReadComplete && !routerChanged) return;

			if (storeChanged && !routerChanged && !formDefinitionChanged) {
				const next = storeUrlInput.value;
				if (!next) return;
				urlRestoreRevision += 1;
				pushStoreStateToRouter(router, cloneDeep(next));
				return;
			}

			const restoreRevision = ++urlRestoreRevision;
			initialUrlReadStarted = true;
			await applyRouterUrlToStore(context, restoreRevision);
			initialUrlReadComplete = true;
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
