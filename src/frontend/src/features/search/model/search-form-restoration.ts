import { toValue, watch, type App, type MaybeRefOrGetter, type Ref } from 'vue';

import type { FormRuntime } from '@/features/form';
import * as FormStore from '@/features/search/model/form/form-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { summarizeLegacySearch } from '@/features/search/model/search-summary';
import type { SubmittedFormRestoration, SubmittedSearch, SubmittedSearchState } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

import { debugLog } from '@/shared/debug/debug';

/** Incoming searches and runtime replacement restore disposable drafts; submission does not. */
export function createSearchFormRestoration(dependencies: {
	corpus: MaybeRefOrGetter<Corpus | undefined>;
	runtime: Readonly<Ref<FormRuntime | null>>;
	submitted: SubmittedSearchState;
	restoredForm: SubmittedFormRestoration;
	restoreLegacy: (corpus: Corpus, submitted: SubmittedSearch) => Promise<FormStore.ModuleRootState>;
	beforeStateLoaded: () => Promise<unknown>;
}) {
	let stopped = false;
	let restoration: object | undefined;
	async function restore() {
		const corpus = toValue(dependencies.corpus);
		const submitted = dependencies.submitted.value;
		if (!corpus || !submitted || stopped) return;
		const operation = {};
		restoration = operation;
		const runtime = dependencies.runtime.value;
		const current = () => !stopped && restoration === operation && toValue(dependencies.corpus) === corpus && dependencies.submitted.value === submitted && dependencies.runtime.value === runtime;
		try {
			await dependencies.beforeStateLoaded();
			if (!current()) return;
			const legacyForm = await dependencies.restoreLegacy(corpus, submitted);
			if (!current()) return;
			const form = dependencies.restoredForm.value;
			if (form) runtime?.state.replaceState(form.state);
			if (form?.state.issues.length) debugLog('form', 'Search form restoration issues', form.state.issues);
			FormStore.actions.replace({ ...legacyForm, interface: { ...legacyForm.interface, viewedResults: InterfaceStore.get.viewedResults() } });
			if (!form?.submittedResult) dependencies.submitted.value = { ...submitted, summary: summarizeLegacySearch(legacyForm, submitted.params.patt, corpus.allAnnotationsMap) };
		} catch (error) {
			if (current()) console.error('Failed to restore search form', error);
		}
	}
	const stopRuntime = watch(dependencies.runtime, () => void restore());
	function stop() {
		stopped = true;
		restoration = undefined;
		stopRuntime();
	}
	return { restore, stop, install: (app: App) => app.onUnmount(stop) };
}
