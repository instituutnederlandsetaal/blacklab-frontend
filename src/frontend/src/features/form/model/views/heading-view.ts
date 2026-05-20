import type { ViewDefinition } from '@/features/form/model/types/form-controllers';

import HeadingView from '@/features/form/views/HeadingView.vue';

export type HeadingViewConfig = {
	title: string;
	description?: string;
};

const headingView: ViewDefinition<'heading', HeadingViewConfig> = {
	kind: 'heading',
	component: HeadingView,
};
export default headingView;
