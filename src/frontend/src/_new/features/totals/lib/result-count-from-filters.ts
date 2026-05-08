import { of, switchMap, type ObservableInput } from 'rxjs';

import type { NormalizedIndex } from '@/_new/types/apptypes';

import { getCorpusTotals, getTotals } from './result-count-helpers';

import type { BlackLabApi } from '@/_new/shared/api/lib/api-types';
import { Loadable } from '@/_new/shared/utils/loadable/loadable';
import { InteractiveLoadable } from '@/_new/shared/utils/loadable/loadable-streams';

function getFilteredSubcorpus(api: BlackLabApi, input: FilteredResultCountLoaderInput) {
	return api
		.getDocs(input.index.id, {
			filter: input.filter || undefined,
			first: 0,
			number: 0,
			includetokencount: true,
			waitfortotal: true,
		})
		.then(r => getTotals(r, input.annotatedFieldId))
		.then(totals => ({
			numberOfMatchingDocuments: totals.numberOfMatchingDocuments,
			tokensInMatchingDocuments: totals.tokensInMatchingDocuments,
			totalDocsInIndex: input.index.documentCount,
			totalTokensInIndex: input.index.tokenCount,
		}));
}

export type FilteredResultCountLoaderInput = {
	index: NormalizedIndex;
	filter: string | undefined | null;
	annotatedFieldId: string;
};

export type FilteredResultCountLoaderOutput = {
	numberOfMatchingDocuments: number;
	tokensInMatchingDocuments: number;
	totalDocsInIndex: number;
	totalTokensInIndex: number;
};

/**
 * Given the active filters, retrieve the total amount of matched docs/tokens.
 * Can be passed a new set of filters at any time, and after debouncing, will retrieve and emit the updated count.
 */
export class FilteredResultCountLoader extends InteractiveLoadable<FilteredResultCountLoaderInput, FilteredResultCountLoaderOutput> {
	constructor(api: BlackLabApi, debounceMs = 1000) {
		super(
			switchMap<FilteredResultCountLoaderInput, ObservableInput<Loadable<FilteredResultCountLoaderOutput>>>(input => {
				if (!input.filter) {
					return of(Loadable.Loaded(getCorpusTotals(input.index, input.annotatedFieldId)));
				}

				return getFilteredSubcorpus(api, { ...input, filter: input.filter }).toObservable();
			}),
			{
				debounce: input => (input.filter ? debounceMs : 0),
			},
		);
	}
}
