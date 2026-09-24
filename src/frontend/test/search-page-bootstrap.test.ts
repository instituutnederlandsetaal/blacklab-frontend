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

test('enables search page scripts only after its DOM is mounted', () => {
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'article', customScriptTiming: 'after-page-bootstrap' }, false);
	pageBootstrap.markScriptsReady();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);

	let formMounted = false;
	const QueryForm = defineComponent({
		setup() {
			onMounted(() => (formMounted = true));
		},
		template: '<div data-test="query-form" />',
	});
	const markScriptsReady = vi.spyOn(pageBootstrap, 'markScriptsReady');
	markScriptsReady.mockImplementation(() => {
		expect(formMounted).toBe(true);
		markScriptsReady.mockRestore();
		pageBootstrap.markScriptsReady();
	});

	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [pageBootstrap, inactiveSearchParameters()],
			stubs: { Debug: true, QueryForm, QuerySummary: true, Results: true },
		},
	});

	expect(wrapper.find('[data-test="query-form"]').exists()).toBe(true);
	expect(pageBootstrap.scriptsReady.value).toBe(true);
	wrapper.unmount();
});

test('does not retrigger scripts for an already-ready search page', () => {
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' }, false);
	pageBootstrap.markScriptsReady();
	const readinessChanges = vi.fn();
	const stop = watch(pageBootstrap.scriptsReady, readinessChanges, { flush: 'sync' });

	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [pageBootstrap, inactiveSearchParameters()],
			stubs: { Debug: true, QueryForm: true, QuerySummary: true, Results: true },
		},
	});

	expect(pageBootstrap.scriptsReady.value).toBe(true);
	expect(readinessChanges).not.toHaveBeenCalled();
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
