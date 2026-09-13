import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue';

import type { Customizations } from '@/customization-api/internal/internal-api';
import type * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import type { ResultRange } from '@/features/search/model/results/view-state';
import type * as ViewStore from '@/features/search/model/results/view-state';
import type { SubmittedSearch } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

import useInjectable from '@/shared/utils/useInjectable';

export type ActiveSearchParameters = Readonly<Ref<EffectiveSearchParameters | undefined>>;
export type ActiveSearch = {
	parameters: ActiveSearchParameters;
	view: Readonly<Ref<string | null>>;
};

export const [, provideActiveSearch, useActiveSearch] = useInjectable<ActiveSearch>('active-search');

/** Derive requests from the submitted search and selected view's controls. */
export function searchParametersFromState(
	selectedView: MaybeRefOrGetter<string | null>,
	options: {
		corpus: MaybeRefOrGetter<Corpus | undefined>;
		submitted: MaybeRefOrGetter<SubmittedSearch | undefined>;
		global: MaybeRefOrGetter<GlobalResultsStore.ModuleRootState>;
		viewState: MaybeRefOrGetter<ViewStore.ViewRootState | undefined>;
		expandedRequestRange: MaybeRefOrGetter<ResultRange | undefined>;
		withSpans: Customizations['searchWithSpans'];
		debug: MaybeRefOrGetter<boolean>;
	},
): EffectiveSearchParameters | undefined {
	const viewName = toValue(selectedView);
	const corpus = toValue(options.corpus);
	const submitted = toValue(options.submitted);
	const view = toValue(options.viewState);
	const range = toValue(options.expandedRequestRange);
	if (!viewName || !corpus || !submitted || !view || !range) return undefined;
	const params = submitted.params;
	const global = toValue(options.global);
	const group = view.groupBy.join(',');
	const viewgroup = view.viewGroup || undefined;
	const field = params.searchfield ?? corpus.mainAnnotatedField;
	const shared = {
		...(toValue(options.debug) ? { explain: true, outputformat: 'json' } : {}),
		...range,
		patt: params.patt,
		filter: params.filter,
		field,
		searchfield: field,
		sample: global.sampleMode === 'percentage' ? (global.sampleSize ?? undefined) : undefined,
		samplenum: global.sampleMode === 'count' ? (global.sampleSize ?? undefined) : undefined,
		sampleseed: global.sampleSize !== null ? (global.sampleSeed ?? undefined) : undefined,
		...(viewgroup ? { viewgroup } : {}),
	};
	if (params.colltype) {
		if (params.colltype !== 'proximity' || !params.patt || params.context == null) return undefined;
		return {
			...shared,
			patt: params.patt,
			colltype: params.colltype,
			collpatt: params.collpatt,
			context: params.context,
			within: params.within,
			reltype: params.reltype,
			annotation: params.annotation ?? corpus.firstMainAnnotation.id,
			sensitive: params.sensitive ?? false,
			scorertype: view.collocationScorer,
			sort: view.sort ?? 'score',
		};
	}
	return {
		...shared,
		pattgapdata: params.pattgapdata,
		group,
		sort: view.sort ?? (corpus.isParallelCorpus && viewName === 'hits' && (!group || viewgroup) ? 'alignments' : undefined),
		context: global.context ?? undefined,
		adjusthits: true,
		withspans: params.patt ? (params.withspans === false ? false : (options.withSpans(params.patt) ?? (params.withspans || corpus.hasRelations || undefined))) : undefined,
	};
}

/** Read-only projection of submitted search, view pagination, and local preferences. */
export function createActiveSearch(selectedView: MaybeRefOrGetter<string | null>, options: Parameters<typeof searchParametersFromState>[1]): ActiveSearch {
	const parameters = computed<EffectiveSearchParameters | undefined>(previous => {
		const next = searchParametersFromState(selectedView, options);
		return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
	});
	const view = computed(() => toValue(selectedView));
	return { parameters, view };
}
