// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import { RawCqlField, TextField, WithinField } from '@/features/form';

describe('field presentation', () => {
	test('applies base attributes and variant sizing consistently', () => {
		const wrapper = mount(TextField, {
			props: {
				id: 'word',
				htmlId: 'word_1',
				modelValue: { value: '', caseSensitive: false },
				displayName: 'Word',
				title: 'Search words',
				class: 'custom-field',
				variant: 'large',
			},
		});

		const root = wrapper.get('#word_1');
		expect(root.classes()).toEqual(expect.arrayContaining(['form-group', 'blf-field', 'custom-field', 'large', 'form-group-lg']));
		expect(root.attributes('title')).toBe('Search words');
		expect(root.get('input[type="text"]').classes()).toContain('input-lg');
		expect(root.get('.file-input-button').classes()).toContain('btn-lg');
	});

	test('applies shared presentation classes to specialized fields', () => {
		const wrapper = mount(RawCqlField, {
			props: {
				id: 'expert',
				htmlId: 'expert_1',
				modelValue: '',
				variant: 'small',
			},
		});

		expect(wrapper.get('#expert_1').classes()).toEqual(expect.arrayContaining(['blf-field', 'blf-expert-query-field', 'small']));
		expect(wrapper.get('textarea').classes()).toContain('input-sm');
	});

	test('translates and sorts within options before rendering', () => {
		const wrapper = mount(WithinField, {
			props: {
				id: 'within',
				htmlId: 'within_1',
				modelValue: { element: 's', attributes: {} },
				options: [
					{ value: 's', label: 'Sentence', attributes: [{ value: 'type', label: 'Type' }] },
					{ value: 'p', label: 'Paragraph' },
				],
				sortOptions: true,
				variant: 'large',
			},
		});

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Paragraph', 'Sentence']);
		expect(wrapper.get('.blf-within-attributes label').text()).toBe('s type');
		expect(wrapper.get('button').classes()).toContain('btn-lg');
		expect(wrapper.get('input').classes()).toContain('input-lg');
	});
});
