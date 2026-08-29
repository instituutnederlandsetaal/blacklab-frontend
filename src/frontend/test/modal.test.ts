// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import Modal from '@/shared/ui/Modal.vue';

enableAutoUnmount(afterEach);

beforeEach(() => {
	document.body.classList.remove('modal-open');
	document.body.removeAttribute('data-modal-count');
});

describe('Modal', () => {
	test('renders its content inline and emits from enabled controls and the backdrop only', async () => {
		const host = document.createElement('section');
		document.body.append(host);
		const wrapper = mount(Modal, {
			attachTo: host,
			props: {
				title: 'Details',
				closeMessage: 'Dismiss',
				closeClass: 'close-kind',
				confirmMessage: 'Apply',
				confirmClass: 'confirm-kind',
			},
			slots: {
				header: '<span class="extra-header">Header</span>',
				body: '<span class="named-body">Named body</span>',
				default: '<span class="default-body">Default body</span>',
				footer: '<span class="extra-footer">Footer</span>',
			},
		});

		expect(host.contains(wrapper.element)).toBe(true);
		expect(wrapper.get('.modal-title').text()).toBe('Details');
		expect(wrapper.get('.extra-header').text()).toBe('Header');
		expect(wrapper.get('.named-body').text()).toBe('Named body');
		expect(wrapper.get('.default-body').text()).toBe('Default body');
		expect(wrapper.get('.extra-footer').text()).toBe('Footer');

		await wrapper.get('.modal-content').trigger('click');
		expect(wrapper.emitted('close')).toBeUndefined();

		await wrapper.get('.modal-header .close').trigger('click');
		await wrapper.get('.modal-footer .close-kind').trigger('click');
		await wrapper.get('.modal-footer .confirm-kind').trigger('click');
		await wrapper.trigger('click');

		expect(wrapper.emitted('close')).toHaveLength(3);
		expect(wrapper.emitted('confirm')).toHaveLength(1);
	});

	test('preserves header and footer slots while close and confirm flags gate dismissal controls', async () => {
		const wrapper = mount(Modal, {
			props: { close: false, confirm: false },
			slots: { header: '<span class="header-slot">Header</span>', footer: '<span class="footer-slot">Footer</span>' },
		});

		expect(wrapper.get('.header-slot').text()).toBe('Header');
		expect(wrapper.get('.footer-slot').text()).toBe('Footer');
		expect(wrapper.findAll('button')).toHaveLength(0);
		await wrapper.trigger('click');
		expect(wrapper.emitted('close')).toBeUndefined();

		await wrapper.setProps({ close: true, closeEnabled: false, confirm: true, confirmEnabled: false });
		expect(wrapper.findAll('button')).toHaveLength(3);
		expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true);
		await wrapper.trigger('click');
		expect(wrapper.emitted('close')).toBeUndefined();

		await wrapper.setProps({ closeEnabled: true, confirmEnabled: true });
		await wrapper.get('.modal-footer .btn-default').trigger('click');
		await wrapper.get('.modal-footer .btn-primary').trigger('click');
		expect(wrapper.emitted('close')).toHaveLength(1);
		expect(wrapper.emitted('confirm')).toHaveLength(1);
	});

	test('lets the string size override boolean sizes and supports every size', async () => {
		const sizes = ['xs', 'sm', 'md', 'lg', 'auto', 'fullscreen'] as const;
		const wrapper = mount(Modal, { props: { xs: true, sm: true } });

		expect(wrapper.classes()).toEqual(expect.arrayContaining(['modal', 'fade', 'in', 'xs', 'sm']));
		for (const size of sizes) {
			await wrapper.setProps({ size });
			expect(wrapper.classes()).toContain(size);
			expect(sizes.filter(candidate => candidate !== size && wrapper.classes().includes(candidate))).toEqual([]);
		}

		await wrapper.setProps({ size: undefined });
		expect(wrapper.classes()).toEqual(expect.arrayContaining(['xs', 'sm']));
	});

	test('counts simultaneous modals and keeps body state until the final unmount', () => {
		const first = mount(Modal);
		expect(document.body.dataset.modalCount).toBe('1');
		expect(document.body.classList.contains('modal-open')).toBe(true);

		const second = mount(Modal);
		expect(document.body.dataset.modalCount).toBe('2');

		first.unmount();
		expect(document.body.dataset.modalCount).toBe('1');
		expect(document.body.classList.contains('modal-open')).toBe(true);

		second.unmount();
		expect(document.body.dataset.modalCount).toBe('0');
		expect(document.body.classList.contains('modal-open')).toBe(false);
	});
});
