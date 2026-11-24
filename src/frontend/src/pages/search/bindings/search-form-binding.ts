import { until } from '@vueuse/core';
import { computed, nextTick, shallowRef, toValue, watch, type App, type MaybeRefOrGetter, type Ref } from 'vue';

import { restoreForm, type CompiledFormResult, type FormOverrides, type FormRuntime } from '@/features/form';
import type { ResultsState } from '@/pages/search/model/results/results-state';
import { createSearchSummary } from '@/pages/search/model/search-summary';
import type { SubmittedSearch, SubmittedSearchState } from '@/pages/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

import { debugLog } from '@/shared/debug/debug';
import createAppInjection from '@/shared/vue/injection';

export type SearchFormActions = {
	submit: (snapshot: CompiledFormResult) => CompiledFormResult;
	reset: () => void;
};

export const [, provideSearchFormBinding, useSearchFormBinding] = createAppInjection<SearchFormActions & { loading: Readonly<Ref<boolean>> }>('search-form-binding');

type Dependencies = {
	customizationsReady: MaybeRefOrGetter<boolean>;
	beforeStateLoaded: () => Promise<unknown>;
	corpus: MaybeRefOrGetter<Corpus | undefined>;
	runtime: Readonly<Ref<FormRuntime | null>>;
	submitted: SubmittedSearchState;
	results: ResultsState;
};

export function createSearchFormBinding({ customizationsReady, beforeStateLoaded, corpus, runtime, submitted, results }: Dependencies) {
	const restoredForm = computed(() => (runtime.value && submitted.current.value ? restoreSubmittedForm(runtime.value, submitted.current.value) : null));
	const pending = shallowRef<{ corpus: Corpus; search: SubmittedSearch } | null>(null);
	const loading = computed(() => pending.value !== null);
	const setupHooks = new WeakMap<Corpus, Promise<unknown>>();
	let stopped = false;

	function submit(snapshot: CompiledFormResult) {
		pending.value = null;
		const { params, targetView, resultPreset } = snapshot;
		const name = params.colltype !== undefined ? 'hits' : (targetView ?? (params.patt ? 'hits' : 'docs'));
		results.resetRanges();
		results.selectView(name);
		const view = results.view(name);
		if (params.colltype !== undefined) {
			view.setGroupBy([]);
			view.setCollocationScorer(params.scorertype);
			view.state.sort = params.sort ?? 'score';
		} else {
			// groupBy clears sort, so save the current sort when the form omitted it.
			const sort = Object.hasOwn(params, 'sort') ? (params.sort ?? null) : view.state.sort;
			if (Object.hasOwn(params, 'group')) view.setGroupBy(params.group ? params.group.split(',') : []);
			view.state.sort = sort;
		}
		if (resultPreset !== undefined) view.state.groupDisplayMode = resultPreset;
		submitted.replace(submittedSearchFromResult(snapshot));
		return snapshot;
	}

	function reset() {
		pending.value = null;
		submitted.reset();
		results.selectView(null);
		results.resetAllViews();
	}

	async function restore() {
		const currentCorpus = toValue(corpus);
		const snapshot = submitted.current.value;
		if (stopped || !currentCorpus || !snapshot) {
			pending.value = null;
			return;
		}
		const target = { corpus: currentCorpus, search: snapshot };
		pending.value = target;
		const isCurrent = () => pending.value === target && toValue(corpus) === target.corpus && submitted.current.value === target.search;
		try {
			await nextTick();
			if (!toValue(customizationsReady)) await until(() => toValue(customizationsReady) || !isCurrent()).toBeTruthy({ flush: 'post' });
			if (!isCurrent()) return;
			let setup = setupHooks.get(currentCorpus);
			if (!setup) {
				setup = beforeStateLoaded().catch(error => console.error('beforeStateLoaded hook failed', error));
				setupHooks.set(currentCorpus, setup);
			}
			await setup;
			if (!isCurrent()) return;
			// A hook can replace the form. Read the current definition after all hooks have settled.
			const form = restoredForm.value;
			if (form) runtime.value?.state.replaceState(form.state);
			if (form?.state.issues.length) debugLog('form', 'Search form restoration issues', form.state.issues);
		} catch (error) {
			if (pending.value === target) console.error('Failed to restore search form', error);
		} finally {
			if (pending.value === target) pending.value = null;
		}
	}

	const stopWatching = watch(runtime, () => {
		if (!loading.value) void restore();
	});
	function stop() {
		stopWatching();
		stopped = true;
		pending.value = null;
	}
	return {
		summary: createSearchSummary(submitted.current, restoredForm),
		submit,
		reset,
		restore,
		loading,
		stop,
		install(app: App) {
			provideSearchFormBinding(app, { submit, reset, loading });
			app.onUnmount(stop);
		},
	};
}

/** Restore the editable form from the submitted snapshot. Result controls stay in their stores. */
export function restoreSubmittedForm(runtime: FormRuntime, submitted: SubmittedSearch) {
	const { withspans, pattgapdata: _gap, ...params } = submitted.params;
	const overrides: FormOverrides = params;
	if (withspans) overrides.withspans = true;
	if (runtime.definition.context.corpus.isParallelCorpus === false) delete overrides.searchfield;
	return restoreForm(runtime.definition, submitted.form, overrides);
}

/** Grouping, sorting, and scoring belong to result views. */
export function submittedSearchFromResult(result: CompiledFormResult): SubmittedSearch {
	const { group: _group, sort: _sort, scorertype: _scorer, ...params } = result.params;
	return { params, form: result.encoded };
}
