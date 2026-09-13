// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { defineComponent, nextTick, onMounted, ref, watch } from 'vue';

import * as InterfaceStore from '@/features/search/model/form/interface-state';
import { createPageBootstrapContext } from '@/navigation/page-bootstrap';

import { provideMockActiveSearchParameters } from './mocks/active-search-parameters';

import SearchPage from '@/pages/search/SearchPage.vue';

function inactiveSearchParameters() {
	return provideMockActiveSearchParameters(ref(undefined), null);
}

test('settles a cached-corpus search page only after its DOM is mounted', () => {
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'article', customScriptTiming: 'after-page-bootstrap' }, false);
	pageBootstrap.markSettled();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);

	let formMounted = false;
	const QueryForm = defineComponent({
		setup() {
			onMounted(() => (formMounted = true));
		},
		template: '<div data-test="query-form" />',
	});
	const markSettled = vi.spyOn(pageBootstrap, 'markSettled');
	markSettled.mockImplementation(() => {
		expect(formMounted).toBe(true);
		markSettled.mockRestore();
		pageBootstrap.markSettled();
	});

	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [pageBootstrap, inactiveSearchParameters()],
			stubs: { Debug: true, QueryForm, QuerySummary: true, Results: true },
		},
	});

	expect(wrapper.find('[data-test="query-form"]').exists()).toBe(true);
	expect(pageBootstrap.settled.value).toBe(true);
	wrapper.unmount();
});

test('does not retrigger an already-settled same-instance search', () => {
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	pageBootstrap.markSettled();
	const settledChanges = vi.fn();
	const stop = watch(pageBootstrap.settled, settledChanges, { flush: 'sync' });

	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [pageBootstrap, inactiveSearchParameters()],
			stubs: { Debug: true, QueryForm: true, QuerySummary: true, Results: true },
		},
	});

	expect(pageBootstrap.settled.value).toBe(true);
	expect(settledChanges).not.toHaveBeenCalled();
	stop();
	wrapper.unmount();
});

test('shows results whenever the store selects a result view', async () => {
	InterfaceStore.actions.viewedResults('hits');
	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [createPageBootstrapContext(), provideMockActiveSearchParameters(ref(undefined), InterfaceStore.get.viewedResults)],
			stubs: { Debug: true, QueryForm: true, QuerySummary: true, Results: true },
		},
	});
	expect(wrapper.findComponent({ name: 'QuerySummary' }).exists()).toBe(true);
	InterfaceStore.actions.viewedResults(null);
	await nextTick();
	expect(wrapper.findComponent({ name: 'QuerySummary' }).exists()).toBe(false);
	InterfaceStore.actions.viewedResults('docs');
	await nextTick();
	expect(wrapper.findComponent({ name: 'QuerySummary' }).exists()).toBe(true);
	wrapper.unmount();
});
