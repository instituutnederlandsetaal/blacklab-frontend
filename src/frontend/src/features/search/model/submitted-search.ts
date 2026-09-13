import { computed, shallowRef, toValue, type MaybeRefOrGetter } from 'vue';

import { restoreForm, type CompiledFormResult, type FormRuntime } from '@/features/form';
import type { FormOverrides } from '@/features/form/model/types/blacklab-params';
import type { ModuleRootState as InterfaceState } from '@/features/search/model/form/interface-state';

export type SearchSummary = { pattern?: string; filter?: string };

/** The submitted query is independent of the editable form and result controls. */
export type SubmittedSearch = {
	params: Omit<FormOverrides, 'withspans'> & { withspans?: boolean; pattgapdata?: string };
	/** Form persistence data is opaque to the search application. */
	form: Record<string, string | null | (string | null)[]>;
	legacyInterface?: Partial<Omit<InterfaceState, 'viewedResults'>>;
	summary?: SearchSummary;
};

export function createSubmittedSearch() {
	return shallowRef<SubmittedSearch>();
}
export type SubmittedSearchState = ReturnType<typeof createSubmittedSearch>;

export type SearchSubmission = CompiledFormResult | { params: SubmittedSearch['params']; interface: InterfaceState; summary?: SearchSummary };

/** Restore the editable form from the submitted snapshot. Result controls stay in their stores. */
export function restoreSubmittedForm(runtime: FormRuntime, submitted: SubmittedSearch) {
	const { withspans, pattgapdata: _gap, ...params } = submitted.params;
	const overrides: FormOverrides = { ...params, ...(withspans ? { withspans } : {}) };
	if (runtime.definition.context.corpus.isParallelCorpus === false) delete overrides.searchfield;
	return restoreForm(runtime.definition, submitted.form, overrides);
}

/** Capture submitted data once so subsequent draft edits cannot change the running search. */
export function submittedSearchFromResult(result: SearchSubmission): SubmittedSearch {
	const { group: _group, sort: _sort, scorertype: _scorer, ...params } = result.params as typeof result.params & { group?: unknown; sort?: unknown; scorertype?: unknown };
	if ('encoded' in result) return { params, form: Object.fromEntries(Object.entries(result.encoded).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) };
	const ui = result.interface;
	return {
		params,
		form: {},
		summary: result.summary ? { ...result.summary } : undefined,
		legacyInterface: {
			form: ui.form,
			...(ui.form === 'search' ? { patternMode: ui.patternMode } : { exploreMode: ui.exploreMode }),
			...(ui.activeAnnotationTab ? { activeAnnotationTab: ui.activeAnnotationTab } : {}),
			...(ui.activeFilterTab ? { activeFilterTab: ui.activeFilterTab } : {}),
		},
	};
}

/** Share the restored snapshot between editable forms and summaries, without reading the draft. */
export function createSubmittedFormRestoration(submitted: MaybeRefOrGetter<SubmittedSearch | undefined>, runtime: MaybeRefOrGetter<FormRuntime | null>) {
	return computed(() => {
		const form = toValue(runtime);
		const search = toValue(submitted);
		return form && search ? restoreSubmittedForm(form, search) : null;
	});
}
export type SubmittedFormRestoration = ReturnType<typeof createSubmittedFormRestoration>;
