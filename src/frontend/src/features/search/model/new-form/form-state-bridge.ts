/*
	Apply compiled form presets to result controls
*/

import type { CompiledFormResult } from '@/features/form';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';

function prepareViews(): void {
	for (const view of Object.values(ViewStore.getState())) {
		view.first = 0;
		view.number = GlobalResultsStore.getState().pageSize;
		view.viewGroup = null;
	}
}

export function handoffCompiledForm(result: CompiledFormResult): void {
	const collocationParams = result.params.colltype !== undefined ? result.params : null;
	const viewName = collocationParams ? 'hits' : (result.targetView ?? (result.params.patt ? 'hits' : 'docs'));

	prepareViews();
	InterfaceStore.actions.viewedResults(viewName);
	const view = ViewStore.getOrCreateModule(viewName);
	if (collocationParams) {
		view.actions.groupBy([]);
		view.actions.collocationScorer(collocationParams.scorertype);
		view.actions.sort(result.params.sort ?? 'score');
		if (result.resultPreset !== undefined) view.actions.groupDisplayMode(result.resultPreset);
		return;
	}
	const previousSort = view.getState().sort;
	if (Object.hasOwn(result.params, 'group')) {
		view.actions.groupBy(result.params.group ? result.params.group.split(',') : []);
		if (!Object.hasOwn(result.params, 'sort')) view.actions.sort(previousSort);
	}
	if (Object.hasOwn(result.params, 'sort')) view.actions.sort(result.params.sort ?? null);
	if (result.resultPreset !== undefined) view.actions.groupDisplayMode(result.resultPreset);
}
