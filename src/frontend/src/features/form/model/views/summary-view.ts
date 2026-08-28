import type { MaybeRefOrGetter } from 'vue';

export type SummaryTotalsState =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| {
			status: 'loaded';
			documents: number;
			tokens: number;
			totalDocuments: number;
			totalTokens: number;
	  };

export type SummaryTotalsInput = {
	filter?: string;
	searchfield?: string;
};

export type SummaryTotalsController = {
	state: MaybeRefOrGetter<SummaryTotalsState>;
	update(input: SummaryTotalsInput): void;
	dispose?(): void;
};

export type SummaryViewConfig = {
	/** A fresh controller is created for each mounted filter overview. */
	createTotals: () => SummaryTotalsController;
};
