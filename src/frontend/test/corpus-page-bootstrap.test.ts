// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { defineComponent, nextTick, onMounted, onUnmounted, shallowRef } from 'vue';

import { createPageBootstrapContext } from '@/navigation/page-bootstrap';

import { ApiError } from '@/shared/api/lib/api-types';
import { Loadable, type Loadable as LoadableType } from '@/shared/utils/loadable/loadable-core';
import { loadableReactiveFromSnapshot } from '@/shared/utils/loadable/loadable-reactive';

import CorpusPage from '@/pages/corpus/CorpusPage.vue';

const mock = vi.hoisted(() => ({ loader: undefined as unknown }));

vi.mock('@/app/state/useCorpusContext', () => ({ useCorpusContextLoader: () => mock.loader }));

test('hides the corpus child while switching and lets the remounted child enable scripts', async () => {
	const snapshot = shallowRef<LoadableType<{ index: { id: string } }>>(Loadable.Loaded({ index: { id: 'alpha' } }));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	const unmounted = vi.fn();
	const SearchChild = defineComponent({
		setup() {
			onMounted(() => pageBootstrap.markScriptsReady());
			onUnmounted(unmounted);
		},
		template: '<div data-test="search-child" />',
	});
	const wrapper = mount(CorpusPage, {
		global: { plugins: [pageBootstrap], stubs: { RouterView: SearchChild, Spinner: true } },
	});

	expect(wrapper.find('[data-test="search-child"]').exists()).toBe(true);
	expect(pageBootstrap.scriptsReady.value).toBe(true);

	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	snapshot.value = Loadable.Loading();
	await nextTick();
	expect(wrapper.find('[data-test="search-child"]').exists()).toBe(false);
	expect(wrapper.get('h2').text()).toBe('corpus.loading');
	expect(unmounted).toHaveBeenCalledOnce();
	expect(pageBootstrap.scriptsReady.value).toBe(false);

	snapshot.value = Loadable.Loaded({ index: { id: 'beta' } });
	await nextTick();
	expect(wrapper.find('[data-test="search-child"]').exists()).toBe(true);
	expect(pageBootstrap.scriptsReady.value).toBe(true);
});

test('shows an explanation without enabling scripts when a loaded context has no corpus', async () => {
	const snapshot = shallowRef<LoadableType<{ index?: { id: string } }>>(Loadable.Loaded({ index: undefined }));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	const wrapper = mount(CorpusPage, {
		global: { plugins: [pageBootstrap], stubs: { RouterLink: true, RouterView: true, Spinner: true } },
	});
	await nextTick();

	expect(wrapper.get('h2').text()).toBe('Corpus not found');
	expect(wrapper.findComponent({ name: 'RouterView' }).exists()).toBe(false);
	expect(pageBootstrap.scriptsReady.value).toBe(false);
	wrapper.unmount();
});

test('shows a load error without enabling scripts', async () => {
	const snapshot = shallowRef<LoadableType<{ index?: { id: string } }>>(Loadable.LoadingError(ApiError.wrap(new Error('offline'))));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	const wrapper = mount(CorpusPage, {
		global: { plugins: [pageBootstrap], stubs: { RouterView: true, Spinner: true } },
	});

	expect(wrapper.text()).toContain('offline');
	expect(pageBootstrap.scriptsReady.value).toBe(false);
	wrapper.unmount();
});

test('shows a missing corpus message without an exception stack', () => {
	const error = new ApiError('CANNOT_OPEN_INDEX', "Could not open index 'test'. Please check the name.", 'Not Found', 404);
	const snapshot = shallowRef<LoadableType<{ index?: { id: string } }>>(Loadable.LoadingError(error));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const wrapper = mount(CorpusPage, {
		global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, RouterView: true, Spinner: true } },
	});

	expect(wrapper.get('h2').text()).toBe('Corpus not found');
	expect(wrapper.get('p').text()).toBe('The requested corpus was not found. Please check the spelling.');
	expect(wrapper.text()).toContain('Browse corpora');
	expect(wrapper.find('pre').exists()).toBe(false);
	wrapper.unmount();
});

test('explains an access failure without exposing the server error code', () => {
	const error = new ApiError('NOT_AUTHORIZED', 'Request rejected by server', 'Forbidden', 403);
	const snapshot = shallowRef<LoadableType<{ index?: { id: string } }>>(Loadable.LoadingError(error));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const wrapper = mount(CorpusPage, {
		global: { stubs: { RouterView: true, Spinner: true } },
	});

	expect(wrapper.get('h2').text()).toBe('Access denied');
	expect(wrapper.get('p').text()).toBe('You do not have permission to access this corpus.');
	expect(wrapper.text()).not.toContain('NOT_AUTHORIZED');
	wrapper.unmount();
});

test('does not describe an unrelated 404 as a missing corpus', () => {
	const error = new ApiError('NOT_FOUND', 'No resource at this path', 'Not Found', 404);
	const snapshot = shallowRef<LoadableType<{ index?: { id: string } }>>(Loadable.LoadingError(error));
	mock.loader = loadableReactiveFromSnapshot(snapshot, { retry: vi.fn() });
	const wrapper = mount(CorpusPage, {
		global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, RouterView: true, Spinner: true } },
	});

	expect(wrapper.get('h2').text()).toBe('Could not load corpus');
	expect(wrapper.get('p').text()).toBe('The server could not find a required resource for this corpus.');
	expect(wrapper.text()).toContain('Browse corpora');
	wrapper.unmount();
});
