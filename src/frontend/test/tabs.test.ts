// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';

import Tabs from '@/shared/ui/Tabs.vue';

describe('Tabs', () => {
	test('ArrowRight moves tab selection and the roving tab stop', async () => {
		const wrapper = mount(Tabs, { props: { tabs: ['First', 'Second'] } });
		const tabs = wrapper.findAll('[role="tab"]');
		expect(tabs.map(tab => tab.attributes('tabindex'))).toEqual(['0', '-1']);

		await tabs[0].trigger('keydown', { key: 'ArrowRight' });
		expect(wrapper.emitted('update:modelValue')).toEqual([[1]]);
		expect(tabs[1].attributes('aria-selected')).toBe('true');
		expect(tabs.map(tab => tab.attributes('tabindex'))).toEqual(['-1', '0']);
	});

	test('forwards fallthrough attributes and listeners to the tablist', async () => {
		const onClick = vi.fn();
		const wrapper = mount(Tabs, {
			attrs: {
				class: 'custom-tabs',
				style: 'color: red',
				'data-testid': 'tabs',
				onClick,
			},
			props: {
				tabs: ['First'],
			},
		});

		const tablist = wrapper.get('[data-testid="tabs"]');
		expect(tablist.classes()).toEqual(expect.arrayContaining(['tabs', 'custom-tabs']));
		expect((tablist.element as HTMLElement).style.color).toBe('red');

		await tablist.trigger('click');
		expect(onClick).toHaveBeenCalledOnce();
	});
});
