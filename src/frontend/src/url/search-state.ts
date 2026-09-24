import { readonly, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { LocationQueryRaw, RouteLocationNormalizedLoaded, Router } from 'vue-router';

import * as HistoryStore from '@/features/history/model/query-history-state';
import * as FormStore from '@/features/search/model/form/form-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import type { SearchSummary, SubmittedSearchState } from '@/features/search/model/submitted-search';
import { provideSearchNavigation, type SearchNavigationPlugin } from '@/navigation/search-navigation';
import type { Corpus } from '@/types/apptypes';
import { readSearchQuery, readSearchResultSettings, createSearchPageQuery } from '@/url/search-query';
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
		const results = InterfaceStore.get.viewedResults();
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
				const { view, global } = readSearchResultSettings(route.query, GlobalResultsStore.getState().pageSize);
				const decoded = readSearchQuery(route.query);
				extras = decoded.extras;
				FormStore.actions.reset();
				ViewStore.actions.resetAllViews({ resetGroupBy: true });
				GlobalResultsStore.actions.replace(global);
				if (viewName) ViewStore.getOrCreateModule(viewName).actions.replace(view);
				InterfaceStore.actions.viewedResults(viewName);
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
			if (GlobalResultsStore.getState().sampleSize !== null && readSearchQuery(route.query).results.sampleseed === undefined) {
				return { name: route.name!, params: route.params, hash: route.hash, query: { ...route.query, sampleseed: GlobalResultsStore.getState().sampleSeed } };
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
