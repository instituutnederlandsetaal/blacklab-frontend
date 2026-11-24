import { computed, type App } from 'vue';

import { localStorageSynced } from '@/shared/utils/localstore';
import useInjectable from '@/shared/utils/useInjectable';

function createLayoutState() {
	const wideView = localStorageSynced('cf/wideView', false);
	return { wideView, containerClass: computed(() => (wideView.value ? 'container-fluid' : 'container')) };
}

const [, provideLayout, useLayout] = useInjectable('layout', createLayoutState);
export { useLayout };

/** Creates the Vue plugin and its per-app layout settings. */
export function createLayout() {
	const state = createLayoutState();
	return { ...state, install: (app: App) => provideLayout(app, state) };
}
