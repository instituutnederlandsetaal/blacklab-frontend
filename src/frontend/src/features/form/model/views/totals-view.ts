import type { ViewDefinition } from '@/features/form/model/types/form-controllers';

import TotalsView from '@/features/form/views/TotalsView.vue';

export type TotalsViewConfig = {
	title?: string;
	baseDocuments: number;
	baseTokens: number;
};

const totalsView: ViewDefinition<'totals', TotalsViewConfig> = {
	kind: 'totals',
	component: TotalsView,
};

export default totalsView;
