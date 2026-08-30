import { concatWith, defer, EMPTY, expand, filter, of, switchMap, takeUntil, tap, timer } from 'rxjs';

import { type BLSearchResult } from '@/types/blacklabtypes';

import { getTotals, type TotalsOutput } from './result-count-helpers';

import type { BlackLabApi, CancelableRequest } from '@/shared/api/lib/api-types';
import { getSearchParameters } from '@/shared/blacklab-helpers/normalize/result-helpers';
import { Loaded, type Loadable } from '@/shared/utils/loadable/loadable-core';
import { InteractiveLoadable } from '@/shared/utils/loadable/loadable-stream';

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
				const getResults: () => CancelableRequest<BLSearchResult> = operation === 'docs' ? () => api.getDocs(indexId, params) : () => api.getHits(indexId, params);
				let latest: Loadable<TotalsOutput> | undefined;
				const recursiveTotal$ = of(Loaded(getTotals(results, initial.annotatedFieldId))).pipe(
					expand((cur: Loadable<TotalsOutput>) => {
						// Expand is recursive: called for each input + each of its own outputs.
						// As a consequence: check carefully for terminating clauses to prevent infinite recursion.
						if (!cur.isLoaded() || this.isDone(cur.value)) return EMPTY;
						// wait a little while before fetching the next batch of results.
						return timer(typeof intervalMs === 'function' ? intervalMs() : intervalMs).pipe(
							switchMap(() =>
								getResults()
									.then(r => getTotals(r, initial.annotatedFieldId))
									.toObservable(),
							),
						);
					}),
					filter(v => !v.isLoading()), // remove loading values. We always want a value or an error in the output.
					tap(v => (latest = v)),
					takeUntil(timer(typeof timeoutMs === 'function' ? timeoutMs() : timeoutMs)),
				);

				return recursiveTotal$.pipe(concatWith(defer(() => (latest?.isLoaded() && !this.isDone(latest.value) ? of(Loaded<TotalsOutput>({ ...latest.value, state: 'paused' })) : EMPTY))));
			}),
			{ debounce: 0 },
		);
		this.next(initial);
	}

	/** Continue a paused count or retry a failed one. */
	public continueCounting() {
		if (this.isError()) this.next(this.initial);
		else if (this.isLoaded() && this.value.state === 'paused') this.next({ ...this.initial, results: this.value.results });
	}

	private isDone(results: TotalsOutput) {
		return results.state !== 'counting';
	}
}
