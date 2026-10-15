// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, ref } from 'vue';

import { createRangeModeOptions, DateField, RangeField } from '@/features/form';

import { optionLabel, optionTitle } from '@/shared/utils/options';

describe('range mode options', () => {
	test('defers labels and titles until they are read', () => {
		const locale = ref('en');
		let translationCalls = 0;
		const options = createRangeModeOptions({
			$t(key) {
				translationCalls++;
				return `${locale.value}:${key}`;
			},
		});

		expect(translationCalls).toBe(0);
		expect(options.map(option => option.value)).toEqual(['permissive', 'strict']);
		expect(optionLabel(options[0])).toBe('en:filter.range.permissive');
		expect(optionTitle(options[1])).toBe('en:filter.range.strictDescription');

		locale.value = 'nl';

		expect(optionLabel(options[0])).toBe('nl:filter.range.permissive');
		expect(optionTitle(options[1])).toBe('nl:filter.range.strictDescription');
	});

	test('reactively renders graph-provided labels and titles in both components', async () => {
		const locale = ref('en');
		const modeOptions = createRangeModeOptions({ $t: key => `${locale.value}:${key}` });
		const date = mount(DateField, {
			props: {
				id: 'published',
				htmlId: 'published',
				displayName: 'Published',
				modelValue: {
					startDate: { y: '', m: '', d: '' },
					endDate: { y: '', m: '', d: '' },
					mode: 'strict',
				},
				modeOptions,
				range: true,
			},
		});
		const range = mount(RangeField, {
			props: {
				id: 'year',
				htmlId: 'year',
				displayName: 'Year',
				modelValue: { low: '', high: '', mode: 'strict' },
				modeOptions,
				showMode: true,
			},
		});

		expect(date.findAll('button').map(button => button.text())).toEqual(['en:filter.range.permissive', 'en:filter.range.strict']);
		expect(range.get('button[value="permissive"]').attributes('title')).toBe('en:filter.range.permissiveDescription');

		locale.value = 'nl';
		await nextTick();

		expect(date.findAll('button').map(button => button.text())).toEqual(['nl:filter.range.permissive', 'nl:filter.range.strict']);
		expect(range.get('button[value="permissive"]').attributes('title')).toBe('nl:filter.range.permissiveDescription');
	});

	test('keeps value-name fallbacks for direct range field mounts', () => {
		const wrapper = mount(RangeField, {
			props: {
				id: 'year',
				htmlId: 'year',
				displayName: 'Year',
				modelValue: { low: '', high: '', mode: 'strict' },
				showMode: true,
			},
		});

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['permissive', 'strict']);
	});
});
