import type { StyleValue } from 'vue';

import type { Option } from '@/shared/utils/options';

export type Tab = Option & {
	/** Optional DOM id for the tab button. Pair with `controls` to link a tab panel. */
	id?: string;
	/** Optional DOM id of the tab panel controlled by this tab. */
	controls?: string;
	class?: string | Record<string, boolean>;
	style?: StyleValue;
};
