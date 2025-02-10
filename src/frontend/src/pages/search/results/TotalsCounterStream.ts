import { of, EMPTY, timer, lastValueFrom, concat, pipe } from 'rxjs';
import { expand, takeUntil, filter, distinctUntilChanged, switchMap, debounceTime, shareReplay, map } from 'rxjs/operators';

import { combineLoadables, InteractiveLoadable, Loadable, mapLoaded, switchMapLoaded, toObservable } from '@/utils/loadable-streams';

import * as UIStore from '@/store/ui';
import * as Api from '@/api';
import * as BLTypes from '@/types/blacklabtypes';
import { NormalizedIndex } from '@/types/apptypes';

export type TotalsInput = {
	indexId: string;
	operation: 'hits'|'docs';
	results: BLTypes.BLSearchResult;
};

export type TotalsOutput = {
	results: BLTypes.BLSearchResult;
	docsRetrieved: number;
	docsCounted: number;
	hitsRetrieved: number;
	hitsCounted: number;
	groups?: number;
	searchTime: number;
	tokensInMatchingDocuments: number;
	numberOfMatchingDocuments: number;
	state: 'counting'|'finished'|'limited'|'paused';
}


function getTotals(r: BLTypes.BLSearchResult): TotalsOutput {
	const hasPatternInfo = BLTypes.hasPatternInfo(r);
	const hasGroupInfo = BLTypes.hasGroupInfo(r);

	return {
		results: r,
		docsRetrieved: r.summary.numberOfDocsRetrieved,
		docsCounted: r.summary.numberOfDocs,
		hitsRetrieved: hasPatternInfo ? r.summary.numberOfHitsRetrieved : 0,
		hitsCounted: hasPatternInfo ? r.summary.numberOfHits : 0,
		groups: hasGroupInfo ? r.summary.numberOfGroups : undefined,
		searchTime: r.summary.searchTime,
		tokensInMatchingDocuments: r.summary.tokensInMatchingDocuments!,
		numberOfMatchingDocuments: r.summary.numberOfDocs!,
		state: r.summary.stillCounting ? 'counting' : (hasPatternInfo && r.summary.stoppedCountingHits) ? 'limited' : 'finished'
	};
}

export class TotalsLoader extends InteractiveLoadable<TotalsInput, TotalsOutput> {
	constructor(private initial: TotalsInput) {
		super(switchMap(({indexId, operation, results}) => {
			// Don't request any actual results, we're just interested in the totals.
			const params = {...results.summary.searchParam, number: 0, first: 0, includeTokenCount: true};
			const timeout$ = timer(UIStore.getState().results.shared.totalsTimeoutDurationMs);
			const recursiveTotal$ = of(Loadable.Loaded(getTotals(results))).pipe(
				expand(cur => {
					if (!cur.isLoaded() || this.isDone(cur.value)) return EMPTY; // Terminating clause/filter intermediate values that are not loaded or are done.
					return toObservable(operation === 'docs'
						? Api.blacklab.getDocs(indexId, params).then(getTotals)
						: Api.blacklab.getHits(indexId, params).then(getTotals)
					);
				}),
				filter(v => !v.isLoading()), // remove loading values. We always want a value or an error in the output.
				takeUntil(timeout$)
			)

			const mostRecentUnfinishedAsPaused = lastValueFrom(recursiveTotal$.pipe(
				filter(v => v.isLoaded()),
				// Only emit a paused state if we're not finished...
				mapLoaded((v): TotalsOutput => this.isDone(v) ? v : {...v, state: 'paused'})
			));

			// Finally return the stream that emits the recursive totals,
			// and when it completes, emit the most recent value as the paused state.
			// prevent duplicate output of last value, once from the recursive stream and once from the mostRecentUnfinishedAsPaused.
			return concat(recursiveTotal$, mostRecentUnfinishedAsPaused).pipe(distinctUntilChanged());
		}));
		this.next(initial);
	}

	public continueCounting() {
		if (this.isError())
			this.next(this.initial);
		else if (this.isLoaded() && !this.isDone(this.value))
			this.next({...this.initial, results: this.value.results});
	}

	private isDone(results: TotalsOutput) { return results.state !== 'counting'; }
}

export type SubcorpusInput = {
	index: NormalizedIndex;
	filter: string|undefined|null;
}
export type SubcorpusOutput = {
	numberOfMatchingDocuments: number;
	tokensInMatchingDocuments: number;
	totalDocsInIndex: number;
	totalTokensInIndex: number;
}

class SubcorpusLoader extends InteractiveLoadable<SubcorpusInput, SubcorpusOutput> {
	constructor() {
		super(pipe(
			debounceTime(1000),
			map(combineLoadables), // type inference breaks here?
			switchMapLoaded(v => v.filter
				// if we have a query, return a Loadable of the request
				? toObservable(
					Api.blacklab.getDocs(v.index.id, {filter: v.filter, first: 0, number: 0, includetokencount: true, waitfortotal: true})
					.then(getTotals)
					.then(totals => ({
						numberOfMatchingDocuments: totals.numberOfMatchingDocuments,
						tokensInMatchingDocuments: totals.tokensInMatchingDocuments,
						totalDocsInIndex: totals.docsCounted,
						totalTokensInIndex: totals.tokensInMatchingDocuments
					}))
				)
				// if we don't have a query, get the properties from the corpus.
				: of(Loadable.Loaded({
					numberOfMatchingDocuments: v.index.documentCount,
					tokensInMatchingDocuments: v.index.tokenCount,
					totalDocsInIndex: v.index.documentCount,
					totalTokensInIndex: v.index.tokenCount
				}))
			),
			shareReplay(1)
		))
	}
}

export const SubmittedSubcorpusLoader = new SubcorpusLoader();
export const SelectedSubcorpusLoader = new SubcorpusLoader();
