// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { defineComponent, nextTick, onMounted, ref, watch } from 'vue';

import * as ViewStore from '@/features/search/model/results/view-state';
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
	ViewStore.selectView('hits');
	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [createPageBootstrapContext(), provideMockActiveSearchParameters(ref(undefined), ViewStore.getSelectedViewName)],
			stubs: { Debug: true, QueryForm: true, QuerySummary: true, Results: true },
		},
	});
	expect(wrapper.findComponent({ name: 'QuerySummary' }).exists()).toBe(true);
	ViewStore.selectView(null);
	await nextTick();
	expect(wrapper.findComponent({ name: 'QuerySummary' }).exists()).toBe(false);
	ViewStore.selectView('docs');
	await nextTick();
	expect(wrapper.findComponent({ name: 'QuerySummary' }).exists()).toBe(true);
	wrapper.unmount();
});
