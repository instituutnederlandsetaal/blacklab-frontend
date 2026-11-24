import URI from 'urijs';
import { computed, nextTick, ref, toValue, type App, type MaybeRefOrGetter, type Ref } from 'vue';
import { isNavigationFailure, NavigationFailureType, type LocationQueryRaw, type Router } from 'vue-router';

import type { HistoryEntryInput } from '@/features/history/model/query-history-state';
import type { ResultsState } from '@/features/search/model/results/results-state';
import type { SearchSummary } from '@/features/search/model/search-summary';
import type { SubmittedSearchState } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';
import { createSearchPageQuery, readSearchQuery } from '@/url/search-query';
import { createUrlProjection } from '@/url/url-projection';

import useInjectable from '@/shared/utils/useInjectable';

const [, provideSearchNavigation, useSearchNavigation] = useInjectable<{ open(url: string): Promise<void> }>('search-navigation');

type SearchUrlDependencies = {
	corpus: MaybeRefOrGetter<Corpus | undefined>;
	search: SubmittedSearchState;
	results: ResultsState;
	form: { restore(): Promise<void>; loading: Readonly<Ref<boolean>>; summary: Readonly<Ref<SearchSummary>> };
	history: { addEntry(entry: HistoryEntryInput): void };
};

export function createSearchUrlBinding(router: Router, { corpus, search, results, form, history }: SearchUrlDependencies) {
	const hasRead = ref(router.currentRoute.value.name !== 'search');
	const initialReadSettled = computed<boolean>(settled => settled || (hasRead.value && !form.loading.value));
	let extras: LocationQueryRaw = {};
	const navigation = createUrlProjection(router, {
		context: route => {
			const index = toValue(corpus);
			return route.name === 'search' && index && route.params.corpus === index.id ? index : null;
		},
		read(route, replaceUrl) {
			const decoded = readSearchQuery(route.query, results.settings.pageSize);
			extras = decoded.extras;
			const parameter = route.params.results;
			const view = (Array.isArray(parameter) ? parameter[0] : parameter) || null;
			results.restore(decoded.global, view, decoded.view);
			search.replace(decoded.submitted);
			const { sampleSize, sampleSeed } = results.settings;
			if (sampleSize !== null && decoded.global.sampleSeed === null) {
				replaceUrl({ path: route.path, hash: route.hash, query: { ...route.query, sampleseed: sampleSeed } });
			}
			const restored = form.restore();
			hasRead.value = true;
			return restored;
		},
		write(route, index) {
			const view = results.selectedView?.state;
			const query = view ? createSearchPageQuery({ submitted: search.current.value, extras, global: results.settings, view }) : {};
			return { name: 'search', params: { corpus: index.id, results: results.selectedViewName ?? '' }, query, hash: route.hash };
		},
		published(target) {
			if (!target.params.results) return;
			const { pattern, filter } = form.summary.value;
			history.addEntry({ url: target.href, displayValues: { pattern: pattern ?? '', filters: filter ?? '' } });
		},
		leave: () => search.reset(),
	});
	let stopped = false;
	async function open(url: string) {
		await nextTick();
		if (stopped) return;
		const uri = new URI(url).host('').protocol('').port('');
		const base = router.options.history.base.replace(/\/+$/, '');
		const path = uri.path();
		if (base && (path === base || path.startsWith(base + '/'))) uri.path(path.slice(base.length) || '/');
		const failure = await router.push(uri.toString());
		// A saved search can match the current route while the user has an unsent draft.
		if (isNavigationFailure(failure, NavigationFailureType.duplicated) && !stopped && router.currentRoute.value === failure.from) {
			await navigation.restoreCurrent();
		}
	}
	function stop() {
		stopped = true;
		navigation.stop();
	}
	return {
		open,
		stop,
		initialReadSettled,
		install(app: App) {
			provideSearchNavigation(app, { open });
			app.onUnmount(stop);
		},
	};
}

export { useSearchNavigation };
