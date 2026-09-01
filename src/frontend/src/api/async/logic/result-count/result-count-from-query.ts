import { concatWith, defer, EMPTY, expand, filter, of, switchMap, takeUntil, tap, timer } from 'rxjs';

import type { ExecutedSearchRequest } from '@/features/search/model/results/result-types';
import { type BLSearchResult } from '@/types/blacklabtypes';

import { getTotals, type TotalsOutput } from './result-count-helpers';

import type { BlackLabApi, CancelableRequest } from '@/shared/api/lib/api-types';
import { Loaded, type Loadable } from '@/shared/utils/loadable/loadable-core';
import { createInteractiveLoadable } from '@/shared/utils/loadable/loadable-stream';

export type TotalsInput = {
	indexId: string;
	request: ExecutedSearchRequest;
	results: BLSearchResult;
	annotatedFieldId: string;
};

/**
 * Given a query and initial result set, keeps fetching more results until all results are counted, and emits the updated totals after each fetch.
 * Can be provided a timeout and interval, and be continued manually if the timeout is reached before counting is finished.
 */
export function createIterativeResultCountLoader(
	initial: TotalsInput,
	api: BlackLabApi,
	{
		intervalMs = 1000,
		timeoutMs = 15000,
	}: Partial<{
		intervalMs: number | (() => number);
		timeoutMs: number | (() => number);
	}> = {},
) {
	const loader = createInteractiveLoadable(
		switchMap(({ indexId, request, results }: TotalsInput) => {
			// Override some settings from the original search, we're not interested in the results, but we need the totals.
			const getResults = (): CancelableRequest<BLSearchResult> => {
				const overrides = { number: 0, first: 0, subcorpussize: true } as const;
				if (request.operation === 'collocations') return api.getCollocations(indexId, { ...request.params, ...overrides });
				if (request.operation === 'docs') return api.getDocs(indexId, { ...request.params, ...overrides });
				return api.getHits(indexId, { ...request.params, ...overrides });
			};
			let latest: Loadable<TotalsOutput> | undefined;
			const recursiveTotal$ = of(Loaded(getTotals(results, initial.annotatedFieldId))).pipe(
				expand((cur: Loadable<TotalsOutput>) => {
					// Expand is recursive: called for each input + each of its own outputs.
					// As a consequence: check carefully for terminating clauses to prevent infinite recursion.
					if (!cur.isLoaded() || cur.value.state !== 'counting') return EMPTY;
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

			return recursiveTotal$.pipe(concatWith(defer(() => (latest?.isLoaded() && latest.value.state === 'counting' ? of(Loaded<TotalsOutput>({ ...latest.value, state: 'paused' })) : EMPTY))));
		}),
		0,
	);
	loader.next(initial);
	return Object.assign(loader, {
		/** Continue a paused count or retry a failed one. */
		continueCounting: () => {
			if (loader.isError()) loader.next(initial);
			else if (loader.isLoaded() && loader.value.state === 'paused') loader.next({ ...initial, results: loader.value.results });
		},
	});
}
