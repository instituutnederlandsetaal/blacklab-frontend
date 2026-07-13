import type { MaybeRefOrGetter } from 'vue';

export type TotalsViewState =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| {
			status: 'loaded';
			documents: number;
			tokens: number;
			totalDocuments: number;
			totalTokens: number;
	  };

export type TotalsViewConfig = {
	totals: MaybeRefOrGetter<TotalsViewState>;
};
