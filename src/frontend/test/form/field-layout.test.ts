// @vitest-environment jsdom

import { mount, enableAutoUnmount } from '@vue/test-utils';
import { describe, expect, test, afterEach } from 'vitest';

import { RawCqlField, TextField } from '@/features/form';

import NumberField from '@/features/form/fields/generic/NumberField.vue';

enableAutoUnmount(afterEach);

describe('field layout and presentation', () => {
	test('applies base attributes and sizing consistently', () => {
		const wrapper = mount(TextField, {
			props: {
				id: 'word',
				htmlId: 'word_1',
				modelValue: { value: '', caseSensitive: false },
				displayName: 'Word',
				title: 'Search words',
				class: 'custom-field',
				size: 'large',
			},
		});

		const root = wrapper.get('#word_1');
		expect(root.classes()).toEqual(expect.arrayContaining(['form-group', 'blf-field', 'custom-field', 'form-group-lg']));
		expect(root.attributes('title')).toBe('Search words');
		expect(root.get('input[type="text"]').classes()).toContain('input-lg');
		expect(root.get('.file-input-button').classes()).toContain('btn-lg');
	});

	test('renders horizontal fields with semantic responsive layout classes', () => {
		const wrapper = mount(TextField, {
			props: {
				id: 'word',
				htmlId: 'word_1',
				modelValue: { value: '', caseSensitive: false },
				displayName: 'Word',
				description: 'Search for one or more words',
				layout: 'horizontal',
				size: 'large',
			},
		});

		const root = wrapper.get('#word_1');
		expect(root.classes()).toEqual(expect.arrayContaining(['form-group', 'form-group-lg', 'blf-field-horizontal']));
		expect(root.classes()).not.toContain('row');
		expect(root.get('label.control-label').classes()).toContain('blf-field-label');

		const controls = root.get('.blf-field-controls');
		expect(controls.get('input[type="text"]').classes()).toContain('input-lg');
		expect(controls.get('.file-input-button').classes()).toContain('btn-lg');
		expect(controls.get('.help-block').text()).toBe('Search for one or more words');
	});

	test('keeps simple fields full-width and free of horizontal wrappers', () => {
		const wrapper = mount(TextField, {
			props: {
				id: 'word',
				htmlId: 'word_1',
				modelValue: { value: '', caseSensitive: false },
				displayName: 'Word',
				controls: 'simple',
				size: 'large',
				showLabel: false,
			},
		});

		const root = wrapper.get('#word_1');
		expect(root.classes()).not.toContain('blf-field-horizontal');
		expect(root.find('.blf-field-label').exists()).toBe(false);
		expect(root.find('.blf-field-controls').exists()).toBe(false);
		expect(root.find('.file-input-button').exists()).toBe(false);
		expect(root.get('input[type="text"]').classes()).toContain('input-lg');
	});

	test('applies shared presentation classes to specialized fields', () => {
		const wrapper = mount(RawCqlField, {
			props: {
				id: 'expert',
				htmlId: 'expert_1',
				modelValue: '',
				size: 'small',
			},
		});

		expect(wrapper.get('#expert_1').classes()).toEqual(expect.arrayContaining(['blf-field', 'blf-expert-query-field']));
		expect(wrapper.get('textarea').classes()).toContain('input-sm');
	});

	test('gives horizontal specialized fields the same semantic layout', () => {
		const wrapper = mount(RawCqlField, {
			props: {
				id: 'expert',
				htmlId: 'expert_1',
				modelValue: '',
				layout: 'horizontal',
			},
		});

		const root = wrapper.get('#expert_1');
		expect(root.classes()).toEqual(expect.arrayContaining(['form-group', 'blf-field-horizontal']));
		expect(root.get('label').classes()).toContain('blf-field-label');
		expect(root.get('.blf-field-controls').find('textarea').exists()).toBe(true);
	});

	test('renders a scalar number field with bounds, integer steps, and shared presentation', () => {
		const wrapper = mount(NumberField, {
			props: {
				id: 'ngram-size',
				htmlId: 'ngram-size_1',
				modelValue: 3,
				displayName: 'N-gram size',
				min: 1,
				max: 5,
				size: 'large',
			},
		});

		const input = wrapper.get('input[type="number"]');
		expect(wrapper.get('label').attributes('for')).toBe('ngram-size_1_value');
		expect(input.attributes()).toMatchObject({ id: 'ngram-size_1_value', min: '1', max: '5', step: '1', value: '3' });
		expect(input.classes()).toContain('input-lg');
	});
});
