// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { defineComponent, nextTick, onMounted, onUnmounted, shallowRef } from 'vue';

import { createPageBootstrapContext } from '@/navigation/page-bootstrap';

import { Loadable, type Loadable as LoadableType } from '@/shared/utils/loadable/loadable-core';
import { loadableReactiveFromSnapshot } from '@/shared/utils/loadable/loadable-reactive';

import CorpusPage from '@/pages/corpus/CorpusPage.vue';

const mock = vi.hoisted(() => ({ loader: undefined as unknown }));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpusContextLoader: () => mock.loader }));

test('hides the corpus child while switching and lets the remounted child settle bootstrap', async () => {
	const snapshot = shallowRef<LoadableType<{ index: { id: string } }>>(Loadable.Loaded({ index: { id: 'alpha' } }));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	const unmounted = vi.fn();
	const SearchChild = defineComponent({
		setup() {
			onMounted(() => pageBootstrap.markSettled());
			onUnmounted(unmounted);
		},
		template: '<div data-test="search-child" />',
	});
	const wrapper = mount(CorpusPage, {
		global: { plugins: [pageBootstrap], stubs: { RouterView: SearchChild, Spinner: true } },
	});

	expect(wrapper.find('[data-test="search-child"]').exists()).toBe(true);
	expect(pageBootstrap.settled.value).toBe(true);

	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	snapshot.value = Loadable.Loading();
	await nextTick();
	expect(wrapper.find('[data-test="search-child"]').exists()).toBe(false);
	expect(unmounted).toHaveBeenCalledOnce();
	expect(pageBootstrap.settled.value).toBe(false);

	snapshot.value = Loadable.Loaded({ index: { id: 'beta' } });
	await nextTick();
	expect(wrapper.find('[data-test="search-child"]').exists()).toBe(true);
	expect(pageBootstrap.settled.value).toBe(true);
});
