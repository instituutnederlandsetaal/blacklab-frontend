import { concat, EMPTY, expand, filter, lastValueFrom, of, switchMap, takeUntil, timer } from 'rxjs';

import { type BLSearchResult } from '@/types/blacklabtypes';

import { getTotals, type TotalsOutput } from './result-count-helpers';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { getSearchParameters } from '@/shared/blacklab-helpers/normalize/result-helpers';
import { Loaded, type Loadable } from '@/shared/utils/loadable/loadable-core';
import { InteractiveLoadable, mapLoaded } from '@/shared/utils/loadable/loadable-stream';

export type TotalsInput = {
	indexId: string;
	operation: 'hits' | 'docs';
	results: BLSearchResult;
	annotatedFieldId: string;
};

/**
 * Given a query and initial result set, keeps fetching more results until all results are counted, and emits the updated totals after each fetch.
 * Can be provided a timeout and interval, and be continued manually if the timeout is reached before counting is finished.
 */
export class IterativeResultCountLoader extends InteractiveLoadable<TotalsInput, TotalsOutput> {
	constructor(
		private initial: TotalsInput,
		api: BlackLabApi,
		{
			intervalMs = 1000,
			timeoutMs = 15000,
		}: Partial<{
			intervalMs: number | (() => number);
			timeoutMs: number | (() => number);
		}> = {},
	) {
		super(
			switchMap(({ indexId, operation, results }) => {
				// Override some settings from the original search, we're not interested in the results, but we need the totals.
				const params = { ...getSearchParameters(results), number: 0, first: 0, subcorpussize: true };
				const recursiveTotal$ = of(Loaded(getTotals(results, initial.annotatedFieldId))).pipe(
					expand((cur: Loadable<TotalsOutput>) => {
						// Expand is recursive: called for each input + each of its own outputs.
						// As a consequence: check carefully for terminating clauses to prevent infinite recursion.
						if (!cur.isLoaded() || this.isDone(cur.value)) return EMPTY;
						// wait a little while before fetching the next batch of results.
						return timer(typeof intervalMs === 'function' ? intervalMs() : intervalMs).pipe(
							switchMap(() =>
								operation === 'docs'
									? api
											.getDocs(indexId, params)
											.then(r => getTotals(r, initial.annotatedFieldId))
											.toObservable()
									: api
											.getHits(indexId, params)
											.then(r => getTotals(r, initial.annotatedFieldId))
											.toObservable(),
							),
						);
					}),
					filter(v => !v.isLoading()), // remove loading values. We always want a value or an error in the output.

					// abort the recursive stream if the timeout is reached.
					takeUntil(timer(typeof timeoutMs === 'function' ? timeoutMs() : timeoutMs)),
				);

				// We want to end with a paused state if the timer hits and the last value we fetched didn't have all results yet.
				// But we can't use the endWith operator, as that needs the value upfront, and we need the last value (which doesn't exist yet).
				// So we use lastValueFrom to get the most recent value from the recursive stream.
				const pausedOrFinishedState = lastValueFrom(
					recursiveTotal$.pipe(
						filter(v => v.isLoaded()),
						// Only emit a paused state if we're not finished...
						mapLoaded((v): TotalsOutput => (this.isDone(v) ? v : { ...v, state: 'paused' })),
					),
				);

				// Finally return the stream that emits the recursive totals,
				// and when it completes, emit the most recent value as the paused state.
				// prevent duplicate output of last value, once from the recursive stream and once from the mostRecentUnfinishedAsPaused.
				return concat(recursiveTotal$, pausedOrFinishedState);
			}),
			{ debounce: 0 },
		);
		this.next(initial);
	}

	/**
	 * Continue the count if paused.
	 * When called and already counting - will abort and restart the current request (if any)
	 */
	public continueCounting() {
		if (this.isError()) this.next(this.initial);
		else if (this.isLoaded() && !this.isDone(this.value)) this.next({ ...this.initial, results: this.value.results });
	}

	private isDone(results: TotalsOutput) {
		return results.state !== 'counting';
	}
}
