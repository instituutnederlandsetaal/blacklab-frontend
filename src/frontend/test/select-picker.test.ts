// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

enableAutoUnmount(afterEach);

const options = [
	{ value: 'a', label: 'Alpha' },
	{ value: 'b', label: 'Beta' },
];
let frames: FrameRequestCallback[];

beforeEach(() => {
	frames = [];
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
		frames.push(callback);
		return frames.length;
	});
});

afterEach(() => {
	document.querySelectorAll('[data-select-picker-test]').forEach(element => element.remove());
	vi.restoreAllMocks();
});

async function open(wrapper: ReturnType<typeof mount>) {
	await wrapper.get('.menu-button').trigger('click');
	await nextTick();
}

function flushFrames() {
	for (const callback of frames.splice(0)) callback(0);
}

test.each(['close', 'unmount'] as const)('%s before the opening frame cannot install global listeners', async action => {
	const wrapper = mount(SelectPicker, { props: { options } });
	const add = vi.spyOn(document, 'addEventListener');
	await open(wrapper);
	if (action === 'close') await wrapper.get('.menu-button').trigger('click');
	else wrapper.unmount();
	await nextTick();

	flushFrames();
	expect(add.mock.calls.filter(([type]) => type === 'click')).toHaveLength(0);
});

test('keeps one positioning listener through teleport changes and stops it on unmount', async () => {
	const ancestor = document.createElement('div');
	const first = document.createElement('div');
	const second = document.createElement('div');
	ancestor.dataset.selectPickerTest = '';
	first.dataset.selectPickerTest = '';
	second.dataset.selectPickerTest = '';
	first.id = 'picker-first';
	second.id = 'picker-second';
	document.body.append(ancestor, first, second);
	const wrapper = mount(SelectPicker, { attachTo: ancestor, props: { container: '#picker-first', options } });
	const reposition = vi.spyOn(wrapper.vm as unknown as { reposition(): void }, 'reposition');
	const close = vi.spyOn(wrapper.vm as unknown as { doClose(): void }, 'doClose');

	await open(wrapper);
	flushFrames();
	reposition.mockClear();
	ancestor.dispatchEvent(new Event('scroll'));
	expect(reposition).toHaveBeenCalledOnce();
	expect(first.querySelector('.combobox-menu')).not.toBeNull();

	await wrapper.setProps({ container: '#picker-second' });
	expect(first.querySelector('.combobox-menu')).toBeNull();
	expect(second.querySelector('.combobox-menu')).not.toBeNull();
	reposition.mockClear();
	ancestor.dispatchEvent(new Event('scroll'));
	window.dispatchEvent(new Event('resize'));
	expect(reposition).toHaveBeenCalledTimes(2);

	wrapper.unmount();
	reposition.mockClear();
	close.mockClear();
	document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	ancestor.dispatchEvent(new Event('scroll'));
	window.dispatchEvent(new Event('resize'));
	expect(reposition).not.toHaveBeenCalled();
	expect(close).not.toHaveBeenCalled();
});

test('keeps internal multiple selection open and emits one deferred change on outside click', async () => {
	const wrapper = mount(SelectPicker, { attachTo: document.body, props: { multiple: true, options } });
	await open(wrapper);
	flushFrames();

	await wrapper.get('.menu-option[data-value="a"]').trigger('click');
	expect(wrapper.get('.combobox-menu').isVisible()).toBe(true);
	expect(wrapper.emitted('update:modelValue')).toEqual([[['a']]]);
	expect(wrapper.emitted('change')).toBeUndefined();

	document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await nextTick();
	expect(wrapper.get('.combobox-menu').isVisible()).toBe(false);
	expect(wrapper.emitted('change')).toEqual([[['a']]]);
});

test('editable input opens on focus and emits its deferred change on tab close', async () => {
	const wrapper = mount(SelectPicker, { attachTo: document.body, props: { editable: true, options } });
	const input = wrapper.get('.menu-input');
	await input.trigger('focus');
	await nextTick();
	flushFrames();
	await input.setValue('custom');
	expect(wrapper.emitted('update:modelValue')).toEqual([['custom']]);
	expect(wrapper.emitted('change')).toBeUndefined();

	await input.trigger('keydown', { key: 'Tab' });
	expect(wrapper.get('.combobox-menu').isVisible()).toBe(false);
	expect(wrapper.emitted('change')).toEqual([['custom']]);
});

test('declared open state cannot be changed internally and preserves a controlled search', async () => {
	const wrapper = mount(SelectPicker, { attachTo: document.body, props: { open: true, searchable: true, options } });
	await nextTick();
	const input = wrapper.get('.menu-search');
	await input.setValue('alp');
	await wrapper.get('.menu-button').trigger('click');

	expect(wrapper.get('.combobox-menu').isVisible()).toBe(true);
	expect((input.element as HTMLInputElement).value).toBe('alp');

	await wrapper.setProps({ open: false });
	await wrapper.get('.menu-button').trigger('click');
	expect(wrapper.get('.combobox-menu').isVisible()).toBe(false);
});

test('uncontrolled button toggles and clears its search on close', async () => {
	const wrapper = mount(SelectPicker, { attachTo: document.body, props: { searchable: true, options } });
	await open(wrapper);
	const input = wrapper.get('.menu-search');
	await input.setValue('alp');
	await wrapper.get('.menu-button').trigger('click');

	expect(wrapper.get('.combobox-menu').isVisible()).toBe(false);
	expect((input.element as HTMLInputElement).value).toBe('');
});

test('hides propagated disabled options before search while preserving survivor order', async () => {
	const wrapper = mount(SelectPicker, {
		props: {
			hideDisabled: true,
			hideEmpty: true,
			open: true,
			searchable: true,
			options: [
				{ value: 'standalone-disabled', label: 'Keep disabled standalone', disabled: true },
				{ label: 'Disabled group', disabled: true, options: [{ value: 'group-disabled', label: 'Keep propagated disabled' }] },
				{ value: 'alpha', label: 'Keep alpha' },
				{
					label: 'Enabled group',
					options: [
						{ value: 'child-disabled', label: 'Keep disabled child', disabled: true },
						{ value: 'beta', label: 'Keep beta' },
						{ value: 'gamma', label: 'Keep gamma' },
					],
				},
				{ label: 'Empty after hide', options: [{ value: 'empty-child', label: 'Keep hidden child', disabled: true }] },
			],
		},
	});
	await nextTick();
	await wrapper.get('.menu-search').setValue('keep');

	expect(wrapper.findAll('.menu-options > li').map(row => row.attributes('data-value') ?? `group:${row.text()}`)).toEqual(['alpha', 'group:Enabled group', 'beta', 'gamma']);
});

test('navigates focus across enabled options with wrapping arrows and clamped pages', async () => {
	const wrapper = mount(SelectPicker, {
		attachTo: document.body,
		props: {
			hideEmpty: true,
			options: [
				{ value: 'a', label: 'Alpha' },
				{ value: 'disabled', label: 'Disabled', disabled: true },
				{ value: 'b', label: 'Beta' },
				{ value: 'c', label: 'Gamma' },
			],
		},
	});
	await open(wrapper);
	flushFrames();
	const menu = wrapper.get('.combobox-menu');
	const focusedValue = () => (document.activeElement as HTMLElement).dataset.value;

	await menu.trigger('keydown', { key: 'ArrowDown' });
	expect(focusedValue()).toBe('a');
	(wrapper.get('.menu-button').element as HTMLElement).focus();
	await menu.trigger('keydown', { key: 'ArrowUp' });
	expect(focusedValue()).toBe('c');
	await menu.trigger('keydown', { key: 'ArrowDown' });
	expect(focusedValue()).toBe('a');
	await menu.trigger('keydown', { key: 'ArrowDown' });
	expect(focusedValue()).toBe('b');
	await menu.trigger('keydown', { key: 'PageDown' });
	expect(focusedValue()).toBe('c');
	await menu.trigger('keydown', { key: 'PageUp' });
	expect(focusedValue()).toBe('a');
});

test('retains selection veto and explicit external setValue without writing back received props', async () => {
	const onBeforeSelect = vi.fn(() => false);
	const vetoed = mount(SelectPicker, { attachTo: document.body, props: { modelValue: null, onBeforeSelect, options } });
	await open(vetoed);
	flushFrames();
	await vetoed.get('.menu-option[data-value="a"]').trigger('click');
	expect(onBeforeSelect).toHaveBeenCalledOnce();
	expect(vetoed.get('.combobox-menu').isVisible()).toBe(true);
	expect(vetoed.emitted('update:modelValue')).toBeUndefined();
	expect(vetoed.emitted('select')).toBeUndefined();

	const root = vetoed.element as HTMLElement & { setValue(value: string | string[]): void };
	root.setValue('b');
	expect(vetoed.emitted('update:modelValue')).toEqual([['b']]);

	const corrected = mount(SelectPicker, { props: { modelValue: 'a', options } });
	await corrected.setProps({ modelValue: 'missing' });
	expect(corrected.emitted('update:modelValue')).toBeUndefined();
	await corrected.setProps({ options: [...options, { value: 'missing', label: 'Loaded later' }] });
	expect(corrected.text()).toContain('Loaded later');
	expect(corrected.emitted('update:modelValue')).toBeUndefined();
});

test('allows selection when onBeforeSelect does not explicitly return false', async () => {
	const wrapper = mount(SelectPicker, { props: { modelValue: null, onBeforeSelect: () => undefined, options } });

	await wrapper.get('.menu-option[data-value="a"]').trigger('click');

	expect(wrapper.emitted('update:modelValue')).toEqual([['a']]);
});

test('receiving editable values and searching options never emits a selection', async () => {
	const editable = mount(SelectPicker, { props: { editable: true, modelValue: 'initial', options } });
	await editable.setProps({ modelValue: 'restored' });
	expect((editable.get('.menu-input').element as HTMLInputElement).value).toBe('restored');
	expect(editable.emitted('update:modelValue')).toBeUndefined();
	const picker = mount(SelectPicker, { props: { searchable: true, options } });
	await open(picker);
	await picker.get('.menu-search').setValue('alp');
	expect(picker.emitted('update:modelValue')).toBeUndefined();
});
