import { of, EMPTY, timer, lastValueFrom, concat, pipe, ObservableInput } from 'rxjs';
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
			// Override some settings from the original search, we're not interested in the results, but we need the totals.
			const params = {...results.summary.searchParam, number: 0, first: 0, includeTokenCount: true};
			const recursiveTotal$ = of(Loadable.Loaded(getTotals(results))).pipe(
				expand((cur: Loadable<TotalsOutput>) => {
					// Expand is recursive: called for each input + each of its own outputs.
					// As a consequence: check carefully for terminating clauses to prevent infinite recursion.
					if (!cur.isLoaded() || this.isDone(cur.value)) return EMPTY;
					// wait a little while before fetching the next batch of results.
					return timer(UIStore.getState().results.shared.totalsRefreshIntervalMs).pipe(
						switchMap(() => operation === 'docs'
							? Api.blacklab.getDocs(indexId, params).then(getTotals).toObservable()
							: Api.blacklab.getHits(indexId, params).then(getTotals).toObservable()
					))
				}),
				filter(v => !v.isLoading()), // remove loading values. We always want a value or an error in the output.

				// abort the recursive stream if the timeout is reached.
				takeUntil(timer(UIStore.getState().results.shared.totalsTimeoutDurationMs)),
			)

			// We want to end with a paused state if the timer hits and the last value we fetched didn't have all results yet.
			// But we can't use the endWith operator, as that needs the value upfront, and we need the last value (which doesn't exist yet).
			// So we use lastValueFrom to get the most recent value from the recursive stream.
			const pausedOrFinishedState = lastValueFrom(recursiveTotal$.pipe(
				filter(v => v.isLoaded()),
				// Only emit a paused state if we're not finished...
				mapLoaded((v): TotalsOutput => this.isDone(v) ? v : {...v, state: 'paused'})
			));

			// Finally return the stream that emits the recursive totals,
			// and when it completes, emit the most recent value as the paused state.
			// prevent duplicate output of last value, once from the recursive stream and once from the mostRecentUnfinishedAsPaused.
			return concat(recursiveTotal$, pausedOrFinishedState);
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
		super(switchMap<SubcorpusInput, ObservableInput<Loadable<SubcorpusOutput>>>(v => {
			if (!v.filter) { // there is no filter - shortcut, we know the entire corpus is the subcorpus
				return of(Loadable.Loaded({
					numberOfMatchingDocuments: v.index.documentCount,
					tokensInMatchingDocuments: v.index.tokenCount,
					totalDocsInIndex: v.index.documentCount,
					totalTokensInIndex: v.index.tokenCount
				}))
			}

			// We have a filter - contact BlackLab and get the total subcorpus.
			return Api.blacklab
				.getDocs(v.index.id, {filter: v.filter, first: 0, number: 0, includetokencount: true, waitfortotal: true})
				.then(getTotals)
				.then(totals => ({
					numberOfMatchingDocuments: totals.numberOfMatchingDocuments,
					tokensInMatchingDocuments: totals.tokensInMatchingDocuments,
					totalDocsInIndex: v.index.documentCount,
					totalTokensInIndex: v.index.tokenCount
				}))
				.toObservable();
		}), {debounce: 1000 })
	}
}

export const SubmittedSubcorpusLoader = new SubcorpusLoader();
export const SelectedSubcorpusLoader = new SubcorpusLoader();
