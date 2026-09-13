import type { ObjectPlugin } from 'vue';

import useInjectable from '@/shared/utils/useInjectable';

/** Saved searches enter through the URL adapter. Ordinary commands use the stores directly. */
export type SearchNavigation = {
	open: (url: string) => Promise<void>;
};

export type SearchNavigationPlugin = ObjectPlugin &
	SearchNavigation & {
		stop: () => void;
	};

export const [, provideSearchNavigation, useSearchNavigation] = useInjectable<SearchNavigation>('search-navigation');
