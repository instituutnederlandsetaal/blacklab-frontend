import { useTimeoutFn } from '@vueuse/core';
import { shallowReadonly, shallowRef, watch } from 'vue';

import type { ExecutedSearchRequest } from '@/pages/search/model/results/result-types';
import { type BLSearchResult } from '@/types/blacklabtypes';

import { getTotals, type TotalsOutput } from './result-count-helpers';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { Loaded, Loadable } from '@/shared/utils/loadable/loadable-core';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

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
	let input = initial;
	const latest = shallowRef<Loadable<TotalsOutput>>(Loadable.Empty());
	const request = useRequestResource<TotalsInput, TotalsOutput>(({ indexId, request, annotatedFieldId }) => {
		const range = { first: 0, number: 0 };
		let response;
		if (request.operation === 'collocations') response = api.getCollocations(indexId, { ...request.params, ...range });
		else if (request.operation === 'docs') response = api.getDocs(indexId, { ...request.params, ...range });
		else response = api.getHits(indexId, { ...request.params, ...range });
		return response.then(result => getTotals(result, annotatedFieldId));
	});
	const poll = useTimeoutFn(() => request.run(input), intervalMs, { immediate: false });
	const deadline = useTimeoutFn(
		() => {
			stopCounting();
			if (latest.value.isLoaded()) latest.value = Loaded({ ...latest.value.value, state: 'paused' });
		},
		timeoutMs,
		{ immediate: false },
	);

	function stopCounting() {
		poll.stop();
		deadline.stop();
		request.reset();
	}
	function start(results: BLSearchResult) {
		stopCounting();
		latest.value = Loaded(getTotals(results, input.annotatedFieldId));
		if (latest.value.value?.state === 'counting') {
			poll.start();
			deadline.start();
		}
	}
	const stop = watch(
		request.current,
		response => {
			// An empty response during polling means the transport cancelled. Explicit resets stop the deadline first.
			if (response.isLoading() || !deadline.isPending.value) return;
			latest.value = response;
			if (response.value?.state === 'counting') poll.start();
			else deadline.stop();
		},
		{ flush: 'sync' },
	);

	start(initial.results);
	return {
		current: shallowReadonly(latest),
		next(nextInput: TotalsInput) {
			input = nextInput;
			start(input.results);
		},
		continueCounting() {
			if (latest.value.isError()) start(input.results);
			else if (latest.value.isLoaded() && latest.value.value.state === 'paused') start(latest.value.value.results);
		},
		dispose() {
			stop();
			stopCounting();
		},
	};
}
