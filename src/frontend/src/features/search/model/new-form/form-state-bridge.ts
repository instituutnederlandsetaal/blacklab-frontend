/*
	Helper module for bridging the new form to the stores and URL
*/

import { type CompiledFormResult, type FormRuntime, type RestoredFormState, restoreForm } from '@/features/form';
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

export function handoffCompiledForm(result: CompiledFormResult): void {
	const current = QueryStore.getState();
	const isCurrentForm = current.form === 'new';
	const queryChanged = !isCurrentForm || stableStringify(current.state.params) !== stableStringify(result.params);

	const viewName = result.targetView ?? (result.params.patt ? 'hits' : 'docs');
	if (!queryChanged) {
		const presentationChanged = current.state.targetView !== result.targetView || current.state.resultPreset !== result.resultPreset;
		QueryStore.actions.search({ form: 'new', state: result });
		if (presentationChanged) {
			InterfaceStore.actions.viewedResults(viewName);
			if (result.resultPreset !== undefined) ViewStore.getOrCreateModule(viewName).actions.groupDisplayMode(result.resultPreset);
		}
		return;
	}

	QueryStore.actions.search({ form: 'new', state: result });
	prepareViews();
	InterfaceStore.actions.viewedResults(viewName);
	const view = ViewStore.getOrCreateModule(viewName);
	const previousSort = view.getState().sort;
	if (Object.hasOwn(result.params, 'group')) {
		view.actions.groupBy(result.params.group ? result.params.group.split(',') : []);
		if (!Object.hasOwn(result.params, 'sort')) view.actions.sort(previousSort);
	}
	if (Object.hasOwn(result.params, 'sort')) view.actions.sort(result.params.sort ?? null);
	if (result.resultPreset !== undefined) view.actions.groupDisplayMode(result.resultPreset);
}

export function restoreSearchForm(runtime: FormRuntime, query: Record<string, unknown>): { state: RestoredFormState; submittedResult: CompiledFormResult | null } {
	const overrides = extractSearchFormOverrides(query, runtime.definition.context.corpus.isParallelCorpus !== false);
	const restored = restoreForm(runtime.definition, query, {
		overrideCandidates: overrides,
		...(overrides.patt ? { legacyPattern: { pattern: overrides.patt, searchfield: overrides.searchfield } } : {}),
	});
	runtime.state.replaceState(restored.state);
	return restored;
}
