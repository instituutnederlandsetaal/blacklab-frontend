import { of } from 'rxjs';
import { switchMap } from 'rxjs/internal/operators/switchMap';
import type { ObservableInput } from 'rxjs/internal/types';

import type { NormalizedIndex } from '@/types/apptypes';

import { getCorpusTotals, getTotals } from './result-count-helpers';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable-core';
import { InteractiveLoadable } from '@/shared/utils/loadable/loadable-stream';

export type SubcorpusInput = {
	index: NormalizedIndex;
	filter: string | undefined | null;
	annotatedFieldId: string;
};

export type SubcorpusOutput = {
	numberOfMatchingDocuments: number;
	tokensInMatchingDocuments: number;
	totalDocsInIndex: number;
	totalTokensInIndex: number;
};

export function getFilteredSubcorpus(api: BlackLabApi, input: SubcorpusInput & { filter: string }) {
	return api
		.getDocs(input.index.id, { filter: input.filter, first: 0, number: 0, includetokencount: true, waitfortotal: true })
		.then(r => getTotals(r, input.annotatedFieldId))
		.then(totals => ({
			numberOfMatchingDocuments: totals.numberOfMatchingDocuments,
			tokensInMatchingDocuments: totals.tokensInMatchingDocuments,
			totalDocsInIndex: input.index.documentCount,
			totalTokensInIndex: input.index.tokenCount,
		}));
}

/**
 * Given the active filters, retrieve the total amount of matched docs/tokens.
 * Can be passed a new set of filters at any time, and after debouncing, will retrieve and emit the updated count.
 */
export class FilteredResultCountLoader extends InteractiveLoadable<SubcorpusInput, SubcorpusOutput> {
	constructor(api: BlackLabApi, debounceMs = 1000) {
		super(
			switchMap<SubcorpusInput, ObservableInput<Loadable<SubcorpusOutput>>>(input => {
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
