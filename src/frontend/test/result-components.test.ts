// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';

import BreadCrumbs from '@/pages/search/results/BreadCrumbs.vue';
import QuerySummary from '@/pages/search/results/QuerySummary.vue';

const query = vi.hoisted(() => ({ pattern: '', filters: '' }));

vi.mock('@/features/search/model/query-state', () => ({
	get: {
		patternSummary: () => query.pattern,
		filterSummary: () => query.filters,
	},
}));

describe('result support components', () => {
	test.each([
		['', '', 'results.querySummary.allDocuments'],
		['[word="water"]', '', '[word="water"] results.querySummary.within results.querySummary.allDocuments'],
		['', 'author: Austen', 'results.querySummary.documentsWhere author: Austen'],
		['[word="water"]', 'author: Austen', '[word="water"] results.querySummary.within results.querySummary.documentsWhere author: Austen'],
	])('assembles the pattern %j and filter %j summary', (pattern, filters, expected) => {
		query.pattern = pattern;
		query.filters = filters;

		expect(mount(QuerySummary).get('.content').attributes('title')).toBe(expected);
	});

	test('renders and invokes only enabled breadcrumb actions', async () => {
		const onClick = vi.fn();
		const wrapper = mount(BreadCrumbs, {
			props: { crumbs: [{ label: 'Results', onClick }, { label: 'Current' }] },
		});

		const link = wrapper.get('a');
		expect(link.attributes('disabled')).toBeUndefined();
		expect(link.classes()).not.toContain('disabled');
		await link.trigger('click');
		expect(onClick).toHaveBeenCalledOnce();

		await wrapper.setProps({ disabled: true });
		expect(wrapper.find('a').exists()).toBe(false);
		expect(wrapper.findAll('li').every(crumb => crumb.classes('active'))).toBe(true);
	});
});
