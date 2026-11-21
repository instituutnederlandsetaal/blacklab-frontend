import { readonly, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { LocationQueryRaw, RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as HistoryStore from '@/features/history/model/query-history-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type { SearchSummary, SubmittedSearchState } from '@/features/search/model/submitted-search';
import { provideSearchNavigation, type SearchNavigationPlugin } from '@/navigation/search-navigation';
import type { Corpus } from '@/types/apptypes';
import { queryNumber } from '@/url/query';
import { createSearchPageQuery, readSearchQuery, searchResultSettings } from '@/url/search-query';
import { createUrlProjection } from '@/url/url-projection';

/** Project the search stores into a URL and restore them on incoming navigation. */
export function createSearchUrlBinding(
	router: Router,
	dependencies: {
		corpus: MaybeRefOrGetter<Corpus | undefined>;
		submittedSearch: SubmittedSearchState;
		restoreForms: () => Promise<void>;
		summary: MaybeRefOrGetter<SearchSummary>;
	},
): SearchNavigationPlugin & { initialReadSettled: Readonly<Ref<boolean>> } {
	let extras: LocationQueryRaw = {};
	const initialReadSettled = ref(router.currentRoute.value.name !== 'search');
	function location(route: RouteLocationNormalizedLoaded, corpus: Corpus) {
		const results = ViewStore.getSelectedViewName();
		const view = results ? ViewStore.getOrCreateModule(results).getState() : null;
		const query = view ? createSearchPageQuery({ submitted: dependencies.submittedSearch.value, extras, global: GlobalResultsStore.getState(), view }) : {};
		return { name: 'search', params: { corpus: corpus.id, results: results ?? '' }, query, hash: route.hash };
	}
	const projection = createUrlProjection(router, {
		context: route => {
			const corpus = toValue(dependencies.corpus);
			return route.name === 'search' && corpus && corpus.id === route.params.corpus ? corpus : null;
		},
		read: async route => {
			try {
				const results = route.params.results;
				const viewName = (Array.isArray(results) ? results[0] : results) || null;
				const decoded = readSearchQuery(route.query);
				const { view, global } = searchResultSettings(decoded, GlobalResultsStore.getState().pageSize);
				extras = decoded.extras;
				ViewStore.actions.resetAllViews({ resetGroupBy: true });
				GlobalResultsStore.actions.replace(global);
				ViewStore.actions.replaceView({ view: viewName, data: view });
				ViewStore.selectView(viewName);
				dependencies.submittedSearch.value = decoded.submitted;
				await dependencies.restoreForms();
			} finally {
				if (route === router.currentRoute.value) initialReadSettled.value = true;
			}
		},
		write: location,
		leave: () => {
			dependencies.submittedSearch.value = undefined;
		},
		normalize: route => {
			const { sampleSize, sampleSeed } = GlobalResultsStore.getState();
			if (sampleSize !== null && queryNumber(route.query, 'sampleseed') === null) {
				return { name: route.name!, params: route.params, hash: route.hash, query: { ...route.query, sampleseed: sampleSeed } };
			}
		},
		published: target => {
			if (!target.params.results) return;
			const { pattern, filter } = toValue(dependencies.summary);
			HistoryStore.actions.addEntry({ url: target.href, displayValues: { pattern: pattern ?? '', filters: filter ?? '' } });
		},
	});
	return {
		...projection,
		initialReadSettled: readonly(initialReadSettled),
		install: app => {
			provideSearchNavigation(app, projection);
			app.use(projection);
		},
	};
}
