import { expandResultRange } from '@/features/search/model/results/pagination';
import type { EffectiveSearchParameters } from '@/features/search/model/results/result-types';
import type { ResultSettings, ResultViewState, SharedResultSettings } from '@/features/search/model/results/results-state';
import type { SubmittedSearch } from '@/features/search/model/submitted-search';
import type { Corpus } from '@/types/apptypes';

export function samplingParameters({ sampleMode, sampleSize, sampleSeed }: SharedResultSettings) {
	return {
		sample: sampleMode === 'percentage' ? (sampleSize ?? undefined) : undefined,
		samplenum: sampleMode === 'count' ? (sampleSize ?? undefined) : undefined,
		sampleseed: sampleSize !== null ? (sampleSeed ?? undefined) : undefined,
	};
}

export function searchParametersFromState({
	corpus,
	submitted,
	viewName,
	view,
	settings,
	debug,
	withSpans,
}: {
	corpus: Corpus | undefined;
	submitted: SubmittedSearch | undefined;
	viewName: string | null;
	view: ResultViewState | undefined;
	settings: ResultSettings;
	debug: boolean;
	withSpans: (query: string) => boolean | null;
}): EffectiveSearchParameters | undefined {
	if (!viewName || !view || !corpus || !submitted) return undefined;
	const params = submitted.params;
	const viewgroup = view.viewGroup || undefined;
	const field = params.searchfield ?? corpus.mainAnnotatedField;
	const shared = {
		...(debug ? { explain: true, outputformat: 'json' } : {}),
		...expandResultRange(view, settings.pageSize),
		patt: params.patt,
		filter: params.filter,
		field,
		searchfield: field,
		...samplingParameters(settings),
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
	const group = view.groupBy.join(',');
	const sortByAlignment = corpus.isParallelCorpus && viewName === 'hits' && (!group || viewgroup);
	let withspans;
	if (params.patt) {
		withspans = params.withspans === false ? false : (withSpans(params.patt) ?? (params.withspans || corpus.hasRelations || undefined));
	}
	return {
		...shared,
		pattgapdata: params.pattgapdata,
		group,
		sort: view.sort ?? (sortByAlignment ? 'alignments' : undefined),
		context: settings.context ?? undefined,
		adjusthits: true,
		withspans,
	};
}
