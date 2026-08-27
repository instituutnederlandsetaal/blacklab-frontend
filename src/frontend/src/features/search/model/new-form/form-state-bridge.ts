/*
	Helper module for bridging the new form to the stores and URL
*/

import { type CompiledFormResult, type FormBuilder, type FormRuntime, type RestoredFormState, restoreFormState } from '@/features/form';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { extractSearchFormOverrides } from '@/features/search/model/new-form/form-overrides';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';

import { stableStringify } from '@/shared/utils/stable-stringify';

function prepareViews(): void {
	for (const view of Object.values(ViewStore.getState())) {
		view.first = 0;
		view.number = GlobalResultsStore.getState().pageSize;
		view.requestedRange = null;
		view.viewGroup = null;
	}
}

export function handoffCompiledForm(result: CompiledFormResult): boolean {
	const current = QueryStore.getState();
	const unchanged = current.form === 'new' && current.state.params !== undefined && stableStringify(current.state.params) === stableStringify(result.params);
	QueryStore.actions.search({ form: 'new', state: result });
	if (unchanged) return false;

	prepareViews();
	const viewName = result.targetView ?? (result.params.patt ? 'hits' : 'docs');
	InterfaceStore.actions.viewedResults(viewName);
	const view = ViewStore.getOrCreateModule(viewName);
	const previousSort = view.getState().sort;
	if (Object.hasOwn(result.params, 'group')) {
		view.actions.groupBy(result.params.group ? result.params.group.split(',') : []);
		if (!Object.hasOwn(result.params, 'sort')) view.actions.sort(previousSort);
	}
	if (Object.hasOwn(result.params, 'sort')) view.actions.sort(result.params.sort ?? null);
	if (result.resultPreset?.groupDisplayMode !== undefined) view.actions.groupDisplayMode(result.resultPreset.groupDisplayMode);
	return true;
}

export function restoreSearchFormState(definition: FormBuilder, query: Record<string, unknown>): RestoredFormState {
	const overrides = extractSearchFormOverrides(query, definition.context.corpus.isParallelCorpus !== false);
	return restoreFormState(definition, query, {
		overrideCandidates: overrides,
		...(overrides.patt ? { legacyPattern: { pattern: overrides.patt, searchfield: overrides.searchfield } } : {}),
	});
}

export function restoreSearchForm(runtime: FormRuntime, query: Record<string, unknown>): { state: RestoredFormState; submittedResult: CompiledFormResult | null } {
	const state = restoreSearchFormState(runtime.definition, query);
	runtime.state.replaceState(state);
	const submittedResult = state.submittedFormId ? runtime.compile(state.submittedFormId) : null;
	if (submittedResult) submittedResult.issues.unshift(...state.issues);
	return { state, submittedResult };
}
