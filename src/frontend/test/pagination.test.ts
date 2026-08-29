// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';

import Pagination from '@/shared/ui/Pagination.vue';

enableAutoUnmount(afterEach);

describe('Pagination', () => {
	test('naturally preserves input identity and focus until the range branch removes it', async () => {
		const wrapper = mount(Pagination, { attachTo: document.body, props: { page: 1, maxPage: 4 } });
		const input = wrapper.get('input').element as HTMLInputElement;
		input.focus();

		await wrapper.setProps({ maxPage: 10 });
		expect(wrapper.get('input').element).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(wrapper.get('li.last a').attributes('title')).toBe('11 (last)');

		await wrapper.setProps({ page2: 3 });
		expect(wrapper.find('input').exists()).toBe(false);
		expect(document.activeElement).not.toBe(input);
	});

	test('emits valid integer direct entry as a zero-based page', async () => {
		const wrapper = mount(Pagination, { props: { page: 1, maxPage: 4 } });
		const input = wrapper.get('input');
		expect(input.attributes('step')).toBe('1');

		(input.element as HTMLInputElement).value = '3';
		await input.trigger('change');
		expect(wrapper.emitted('change')).toEqual([[2]]);
	});

	test.each([
		['empty', ''],
		['decimal', '2.5'],
		['non-finite', '1e309'],
		['same active page', '2'],
		['below minimum', '0'],
		['above maximum', '6'],
	])('resets %s direct entry without emitting', async (_name, value) => {
		const wrapper = mount(Pagination, { props: { page: 1, maxPage: 4 } });
		const input = wrapper.get('input');
		(input.element as HTMLInputElement).value = value;

		await input.trigger('change');
		expect(wrapper.emitted('change')).toBeUndefined();
		expect((input.element as HTMLInputElement).value).toBe('2');
	});

	test('resets and blurs direct entry on escape', async () => {
		const wrapper = mount(Pagination, { attachTo: document.body, props: { page: 1, maxPage: 4 } });
		const input = wrapper.get('input');
		(input.element as HTMLInputElement).value = '4';
		(input.element as HTMLInputElement).focus();

		await input.trigger('keyup', { key: 'Escape' });
		expect((input.element as HTMLInputElement).value).toBe('2');
		expect(document.activeElement).not.toBe(input.element);
	});

	test('emits the same page when it is only the inactive centre page', async () => {
		const wrapper = mount(Pagination, { props: { page: 2, pageActive: false, editable: false, maxPage: 4 } });

		await wrapper
			.findAll('a')
			.find(link => link.text() === '3')!
			.trigger('click');
		expect(wrapper.emitted('change')).toEqual([[2]]);
		expect(wrapper.emitted('active')).toBeUndefined();
	});

	test('emits active for the active centre page and gates disabled controls', async () => {
		const wrapper = mount(Pagination, { props: { page: 2, editable: false, maxPage: 4 } });
		await wrapper.get('li.current a').trigger('click');
		expect(wrapper.emitted('active')).toEqual([[2]]);

		await wrapper.setProps({ disabled: true });
		expect(wrapper.find('li.current a').exists()).toBe(false);
		await wrapper.get('li.next a').trigger('click');
		expect(wrapper.emitted('change')).toBeUndefined();
	});

	test('renders page ranges, totals, offsets, and zero-based navigation', async () => {
		const wrapper = mount(Pagination, { props: { page: 2, page2: 4, maxPage: 8, showTotal: true } });
		const single = mount(Pagination, { props: { page: 2, page2: 2, maxPage: 8, editable: false, showTotal: true } });

		expect(wrapper.find('input').exists()).toBe(false);
		expect(wrapper.get('li.current').text()).toBe('3 - 5/9');
		expect(single.get('li.current').text()).toBe('3/9');
		expect(
			wrapper
				.findAll('li')
				.filter(item => !['first', 'prev', 'current', 'next', 'last'].some(className => item.classes().includes(className)))
				.map(item => item.text()),
		).toEqual(['1', '2', '6', '7', '9']);

		await wrapper.get('li.prev a').trigger('click');
		await wrapper.get('li.next a').trigger('click');
		await wrapper.get('li.first a').trigger('click');
		await wrapper.get('li.last a').trigger('click');
		expect(wrapper.emitted('change')).toEqual([[1], [3], [0], [8]]);
	});

	test('clamps labels while retaining the empty-article 1/0 edge', () => {
		const below = mount(Pagination, { props: { page: -3, minPage: 2, maxPage: 5, editable: false } });
		expect(below.get('li.current').text()).toBe('3');
		expect(below.find('li.prev').exists()).toBe(false);

		const above = mount(Pagination, { props: { page: 8, maxPage: 5, editable: false } });
		expect(above.get('li.current').text()).toBe('6');
		expect(above.find('li.next').exists()).toBe(false);

		const emptyArticle = mount(Pagination, { props: { page: 0, maxPage: -1, editable: false, showTotal: true } });
		expect(emptyArticle.get('li.current').text()).toBe('1/0');
		expect(emptyArticle.get('li.last span').attributes('title')).toBe('0 (last)');
	});
});
