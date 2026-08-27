/*
	Helper module for bridging the new form to the stores and URL
*/

import { type CompiledFormResult, type FormOverrides, type FormOutputName, type FormBuilder, type RestoredFormState, restoreFormState } from '@/features/form';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { applySearchFormOverrides, extractSearchFormOverrides } from '@/features/search/model/new-form/form-overrides';
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

export function handoffCompiledForm(result: CompiledFormResult, overrides: Readonly<FormOverrides> = {}, acceptedOutputs: readonly FormOutputName[] = []): boolean {
	const effectiveResult = applySearchFormOverrides(result, overrides, acceptedOutputs);
	const current = QueryStore.getState();
	const unchanged = current.form === 'new' && current.state.params !== undefined && stableStringify(current.state.params) === stableStringify(effectiveResult.params);
	QueryStore.actions.search({ form: 'new', state: effectiveResult });
	if (unchanged) return false;

	prepareViews();
	const viewName = effectiveResult.targetView ?? (effectiveResult.params.patt ? 'hits' : 'docs');
	InterfaceStore.actions.viewedResults(viewName);
	const view = ViewStore.getOrCreateModule(viewName);
	const previousSort = view.getState().sort;
	if (Object.hasOwn(effectiveResult.params, 'group')) {
		view.actions.groupBy(effectiveResult.params.group ? effectiveResult.params.group.split(',') : []);
		if (!Object.hasOwn(effectiveResult.params, 'sort')) view.actions.sort(previousSort);
	}
	if (Object.hasOwn(effectiveResult.params, 'sort')) view.actions.sort(effectiveResult.params.sort ?? null);
	if (effectiveResult.resultPreset?.groupDisplayMode !== undefined) view.actions.groupDisplayMode(effectiveResult.resultPreset.groupDisplayMode);
	return true;
}

export function restoreSearchFormState(definition: FormBuilder, query: Record<string, unknown>): RestoredFormState {
	const overrides = extractSearchFormOverrides(query, definition.context.corpus.isParallelCorpus !== false);
	return restoreFormState(definition, query, {
		overrideCandidates: overrides,
		...(overrides.patt ? { legacyPattern: { pattern: overrides.patt, searchfield: overrides.searchfield } } : {}),
	});
}
