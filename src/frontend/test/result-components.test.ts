// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';

import { provideSearchSummary } from '@/features/search/model/search-summary';

import BreadCrumbs from '@/pages/search/results/BreadCrumbs.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';

describe('result support components', () => {
	test.each([
		['', '', 'results.querySummary.allDocuments'],
		['[word="water"]', '', '[word="water"] results.querySummary.within results.querySummary.allDocuments'],
		['', 'author: Austen', 'results.querySummary.documentsWhere author: Austen'],
		['[word="water"]', 'author: Austen', '[word="water"] results.querySummary.within results.querySummary.documentsWhere author: Austen'],
	])('assembles the pattern %j and filter %j summary', (pattern, filters, expected) => {
		const summary = ref({ pattern, filter: filters });
		const wrapper = mount(QuerySummary, { global: { plugins: [app => provideSearchSummary(app, summary)] } });
		expect(wrapper.get('.content').attributes('title')).toBe(expected);
	});

	test('renders and invokes only enabled breadcrumb actions', async () => {
		const onClick = vi.fn();
		const wrapper = mount(BreadCrumbs, {
			props: { crumbs: [{ label: 'Results', onClick }, { label: 'Current' }] },
		});

		const link = wrapper.get('a');
		await link.trigger('click');
		expect(onClick).toHaveBeenCalledOnce();

		await wrapper.setProps({ disabled: true });
		expect(wrapper.find('a').exists()).toBe(false);
	});
});
