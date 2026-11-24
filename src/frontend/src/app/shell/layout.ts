import { computed, type App } from 'vue';

import { localStorageSynced } from '@/shared/utils/localstore';
import createAppInjection from '@/shared/vue/injection';

function createLayoutState() {
	const wideView = localStorageSynced('cf/wideView', false);
	return { wideView, containerClass: computed(() => (wideView.value ? 'container-fluid' : 'container')) };
}

const [, provideLayout, useLayout] = createAppInjection('layout', createLayoutState);
export { useLayout };

/** Creates the Vue plugin and its per-app layout settings. */
export function createLayout() {
	const state = createLayoutState();
	return { ...state, install: (app: App) => provideLayout(app, state) };
}
