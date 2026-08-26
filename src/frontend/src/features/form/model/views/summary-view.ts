import type { MaybeRefOrGetter } from 'vue';

import type { FormOutputName } from '@/features/form/model/types/form-output';
import type { FormValue } from '@/features/form/model/types/form-shape';
import type { TotalsViewState } from '@/features/form/model/views/totals-view';

export type SummaryTotalsInput = {
	filter?: string;
	searchfield?: string;
};

export type SummaryTotalsController = {
	state: MaybeRefOrGetter<TotalsViewState>;
	update(input: SummaryTotalsInput): void;
	dispose?(): void;
};

export type SummaryViewConfig = {
	title?: FormValue<string>;
	/** Show entries whose controller affects at least one of these parameters. */
	summaryType?: FormOutputName | FormOutputName[];
	showRaw?: boolean;
	/** Add a live totals section below the summaries. A fresh controller is created for each mounted view. */
	createTotals?: () => SummaryTotalsController;
};
