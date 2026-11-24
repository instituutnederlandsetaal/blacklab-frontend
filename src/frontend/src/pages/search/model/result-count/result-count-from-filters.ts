import { useDebounceFn } from '@vueuse/core';
import { computed, shallowRef } from 'vue';

import type { NormalizedIndex } from '@/types/apptypes';

import { getCorpusTotals, getTotals } from './result-count-helpers';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { Loadable } from '@/shared/utils/loadable/loadable-core';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

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

function getFilteredSubcorpus(api: BlackLabApi, input: SubcorpusInput & { filter: string }) {
	return api
		.getDocs(input.index.id, { filter: input.filter, first: 0, number: 0, waitfortotal: true })
		.then(r => getTotals(r, input.annotatedFieldId))
		.then(totals => ({
			numberOfMatchingDocuments: totals.numberOfMatchingDocuments,
			tokensInMatchingDocuments: totals.tokensInMatchingDocuments,
			totalDocsInIndex: input.index.documentCount,
			totalTokensInIndex: input.index.tokenCount,
		}));
}

/** Whole-corpus totals are available immediately; wait for filter edits to settle before querying BlackLab. */
export function createFilteredResultCountLoader(api: BlackLabApi) {
	const unfiltered = shallowRef<SubcorpusOutput>();
	const filtered = useRequestResource((input: SubcorpusInput & { filter: string }) => getFilteredSubcorpus(api, input));
	const debounced = useDebounceFn((input: SubcorpusInput & { filter: string }) => {
		filtered.run(input);
		unfiltered.value = undefined;
	}, 1000);
	/** Cancel both a scheduled count and any request that has already started. */
	function dispose() {
		debounced.cancel();
		filtered.reset();
	}
	return {
		current: computed(() => (unfiltered.value ? Loadable.Loaded(unfiltered.value) : filtered.current.value)),
		update(input: SubcorpusInput) {
			if (input.filter) void debounced({ ...input, filter: input.filter });
			else {
				dispose();
				unfiltered.value = getCorpusTotals(input.index, input.annotatedFieldId);
			}
		},
		dispose,
	};
}
