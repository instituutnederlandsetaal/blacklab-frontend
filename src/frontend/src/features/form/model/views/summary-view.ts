import type { MaybeRefOrGetter } from 'vue';

import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type { FormValue } from '@/features/form/model/types/form-shape';
import type { TotalsViewState } from '@/features/form/model/views/totals-view';

export type SummaryTotalsInput = {
	filter: string | null;
	searchfield: string | null;
};

export type SummaryTotalsController = {
	state: MaybeRefOrGetter<TotalsViewState>;
	update(input: SummaryTotalsInput): void;
	dispose?(): void;
};

export type SummaryViewConfig = {
	title?: FormValue<string>;
	/** Show entries whose controller affects at least one of these parameters. */
	summaryType?: BlackLabParameter | BlackLabParameter[];
	showRaw?: boolean;
	/** Add a live totals section below the summaries. A fresh controller is created for each mounted view. */
	createTotals?: () => SummaryTotalsController;
};
