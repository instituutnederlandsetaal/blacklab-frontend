import type { ViewDefinition } from '@/features/form/model/types/form-controllers';

import SummaryView from '@/features/form/views/SummaryView.vue';
export type SummaryViewConfig = {
	title?: string;
	showRaw?: boolean;
};

const summaryView: ViewDefinition<'summary', SummaryViewConfig> = {
	kind: 'summary',
	component: SummaryView,
};

export default summaryView;
