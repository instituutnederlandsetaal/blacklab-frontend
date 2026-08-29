// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { expect, test, vi } from 'vitest';
import { defineComponent, onMounted, watch } from 'vue';

import { createPageBootstrapContext } from '@/navigation/page-bootstrap';

import SearchPage from '@/pages/search/SearchPage.vue';

test('settles a cached-corpus search page only after its DOM is mounted', () => {
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'article', customScriptTiming: 'after-page-bootstrap' });
	pageBootstrap.markSettled();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' });

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
			plugins: [pageBootstrap],
			stubs: { Debug: true, QueryForm, QuerySummary: true, Results: true },
		},
	});

	expect(wrapper.find('[data-test="query-form"]').exists()).toBe(true);
	expect(pageBootstrap.settled.value).toBe(true);
	wrapper.unmount();
});

test('does not retrigger settlement after CorpusPage settles the initial search', () => {
	const pageBootstrap = createPageBootstrapContext();
	pageBootstrap.changePage({ name: 'search', customScriptTiming: 'after-page-bootstrap' });
	pageBootstrap.markSettled();
	const settledChanges = vi.fn();
	const stop = watch(pageBootstrap.settled, settledChanges, { flush: 'sync' });

	const wrapper = shallowMount(SearchPage, {
		global: {
			plugins: [pageBootstrap],
			stubs: { Debug: true, QueryForm: true, QuerySummary: true, Results: true },
		},
	});

	expect(pageBootstrap.settled.value).toBe(true);
	expect(settledChanges).not.toHaveBeenCalled();
	stop();
	wrapper.unmount();
});
