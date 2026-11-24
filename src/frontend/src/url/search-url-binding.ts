import { computed, ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { LocationQueryRaw, Router } from 'vue-router';

import type { ResultsState } from '@/features/search/model/results/results-state';
import type { SubmittedSearchState } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';
import { queryString } from '@/url/query';
import { readSearchQuery, writeSearchQuery } from '@/url/search-query';
import { createUrlBinding } from '@/url/url-binding';

type SearchUrlDependencies = {
	corpus: MaybeRefOrGetter<Corpus | undefined>;
	search: SubmittedSearchState;
	results: ResultsState;
	form: { restore(): Promise<void>; loading: Readonly<Ref<boolean>> };
	onResultsUrl: (url: string) => void;
};

export function createSearchUrlBinding(router: Router, { corpus, search, results, form, onResultsUrl }: SearchUrlDependencies) {
	const hasRead = ref(router.currentRoute.value.name !== 'search');
	const initialReadSettled = computed<boolean>(settled => settled || (hasRead.value && !form.loading.value));
	let extras: LocationQueryRaw = {};
	const binding = createUrlBinding(router, {
		context: route => {
			const index = toValue(corpus);
			return route.name === 'search' && index && route.params.corpus === index.id ? index : null;
		},
		read(route, replaceUrl) {
			const decoded = readSearchQuery(route.query, results.settings.pageSize);
			extras = decoded.extras;
			const view = queryString(route.params, 'results');
			results.restore(decoded.global, view, decoded.view);
			search.replace(decoded.submitted);
			const { sampleSize, sampleSeed } = results.settings;
			if (sampleSize !== null && decoded.global.sampleSeed === null) {
				replaceUrl({ path: route.path, hash: route.hash, query: { ...route.query, sampleseed: sampleSeed } });
			}
			void form.restore();
			hasRead.value = true;
		},
		write(route, index) {
			const view = results.selectedView?.state;
			const query = view ? writeSearchQuery({ submitted: search.current.value, extras, global: results.settings, view }) : {};
			return { name: 'search', params: { corpus: index.id, results: results.selectedViewName ?? '' }, query, hash: route.hash };
		},
		published(target) {
			if (target.params.results) onResultsUrl(target.href);
		},
		leave: () => search.reset(),
	});
	return { ...binding, initialReadSettled };
}
