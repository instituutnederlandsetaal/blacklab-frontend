import type { MaybeRefOrGetter } from 'vue';

import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';

export type SummaryViewConfig = {
	title?: MaybeRefOrGetter<string>;
	/** Show entries whose controller affects at least one of these parameters. */
	summaryType?: BlackLabParameter | BlackLabParameter[];
	showRaw?: boolean;
};
