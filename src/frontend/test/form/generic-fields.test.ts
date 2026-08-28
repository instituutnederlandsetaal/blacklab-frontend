// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, ref, toRaw } from 'vue';

import { RawCqlField, TextField, WithinField } from '@/features/form';
import type { WithinFieldOption } from '@/features/form/fields/within-field';

import NumberField from '@/features/form/fields/generic/NumberField.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

describe('field presentation', () => {
	test('reactively resolves deferred select option and group text', async () => {
		const locale = ref('en');
		const wrapper = mount(SelectPicker, {
			props: {
				modelValue: 'value',
				options: [
					{
						label: () => `${locale.value}:group`,
						title: () => `${locale.value}:group-title`,
						options: [
							{
								value: 'value',
								label: () => `${locale.value}:label`,
								title: () => `${locale.value}:title`,
							},
						],
					},
				],
			},
		});

		expect(wrapper.get('.menu-button .menu-value').text()).toBe('en:label');
		expect(wrapper.get('.menu-group').text()).toBe('en:group');
		expect(wrapper.get('.menu-group').attributes('title')).toBe('en:group-title');
		expect(wrapper.get('.menu-option[data-value="value"]').attributes('title')).toBe('en:title');

		locale.value = 'nl';
		await nextTick();

		expect(wrapper.get('.menu-button .menu-value').text()).toBe('nl:label');
		expect(wrapper.get('.menu-group').text()).toBe('nl:group');
		expect(wrapper.get('.menu-group').attributes('title')).toBe('nl:group-title');
		expect(wrapper.get('.menu-option[data-value="value"]').attributes('title')).toBe('nl:title');
	});

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

	test('renders horizontal fields with semantic responsive layout classes', () => {
		const wrapper = mount(TextField, {
			props: {
				id: 'word',
				htmlId: 'word_1',
				modelValue: { value: '', caseSensitive: false },
				displayName: 'Word',
				description: 'Search for one or more words',
				variant: ['horizontal', 'large'],
			},
		});

		const root = wrapper.get('#word_1');
		expect(root.classes()).toEqual(expect.arrayContaining(['form-group', 'form-group-lg', 'blf-field-horizontal', 'horizontal']));
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
				variant: ['simple', 'large'],
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
				variant: 'small',
			},
		});

		expect(wrapper.get('#expert_1').classes()).toEqual(expect.arrayContaining(['blf-field', 'blf-expert-query-field', 'small']));
		expect(wrapper.get('textarea').classes()).toContain('input-sm');
	});

	test('gives horizontal specialized fields the same semantic layout', () => {
		const wrapper = mount(RawCqlField, {
			props: {
				id: 'expert',
				htmlId: 'expert_1',
				modelValue: '',
				variant: 'horizontal',
			},
		});

		const root = wrapper.get('#expert_1');
		expect(root.classes()).toEqual(expect.arrayContaining(['form-group', 'blf-field-horizontal', 'horizontal']));
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
				variant: 'large',
			},
		});

		const input = wrapper.get('input[type="number"]');
		expect(wrapper.get('label').attributes('for')).toBe('ngram-size_1_value');
		expect(input.attributes()).toMatchObject({ id: 'ngram-size_1_value', min: '1', max: '5', step: '1', value: '3' });
		expect(input.classes()).toContain('input-lg');
	});

	test('clamps and snaps numeric input without emitting NaN', async () => {
		const wrapper = mount(NumberField, {
			props: {
				id: 'ngram-size',
				htmlId: 'ngram-size_1',
				modelValue: 3,
				displayName: 'N-gram size',
				min: 1,
				max: 5,
			},
		});
		const input = wrapper.get('input[type="number"]');

		await input.setValue('7.8');
		await input.setValue('-2');
		await input.setValue('3.6');
		expect(wrapper.emitted('update:modelValue')?.map(args => args[0])).toEqual([5, 1, 4]);

		await input.setValue('');
		expect(wrapper.emitted('update:modelValue')?.map(args => args[0])).toEqual([5, 1, 4]);
		expect((input.element as HTMLInputElement).value).toBe('3');
	});

	test('snaps fractional input to a custom step based at the minimum', async () => {
		const wrapper = mount(NumberField, {
			props: {
				id: 'fraction',
				htmlId: 'fraction_1',
				modelValue: 0.1,
				displayName: 'Fraction',
				min: 0.1,
				max: 1,
				step: 0.2,
			},
		});

		await wrapper.get('input').setValue('0.46');

		expect(wrapper.emitted('update:modelValue')).toEqual([[0.5]]);
	});

	test('sorts within elements and attributes without replacing configured option objects', () => {
		const document = { value: '', label: 'Document', metadata: { kind: 'document' } };
		const type = { value: 'type', label: 'Type', title: 'Type title', disabled: true };
		const role = { value: 'role', label: 'Role' };
		const sentence = { value: 's', label: 'Sentence', attributes: [type, role] };
		const paragraph = { value: 'p', label: 'Paragraph' };
		const tiedParagraph = { value: 'p2', label: 'Paragraph' };
		const options = [sentence, document, paragraph, tiedParagraph] as WithinFieldOption[];
		const wrapper = mount(WithinField, {
			props: {
				id: 'within',
				htmlId: 'within_1',
				modelValue: { element: 's', attributes: {} },
				options,
				sortOptions: true,
				variant: 'large',
			},
		});

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Document', 'Paragraph', 'Paragraph', 'Sentence']);
		expect(wrapper.findAll('.blf-within-attributes label').map(label => label.text())).toEqual(['Role', 'Type']);
		expect(wrapper.get('#within_1_type').attributes('title')).toBe('Type title');
		expect(wrapper.findAll('button').every(button => button.classes().includes('btn-lg'))).toBe(true);
		expect(wrapper.get('input').classes()).toContain('input-lg');

		const setup = (wrapper.vm.$ as unknown as { setupState: { sortedOptions: WithinFieldOption[]; selectedAttributes: WithinFieldOption[] } }).setupState;
		expect(setup.sortedOptions).toEqual([document, paragraph, tiedParagraph, sentence]);
		expect(toRaw(setup.sortedOptions[0])).toBe(document);
		expect(toRaw(setup.sortedOptions[1])).toBe(paragraph);
		expect(toRaw(setup.sortedOptions[2])).toBe(tiedParagraph);
		expect(toRaw(setup.sortedOptions[3])).toBe(sentence);
		expect(setup.selectedAttributes).toEqual([role, type]);
		expect(toRaw(setup.selectedAttributes[1])).toBe(type);
		expect(options).toEqual([sentence, document, paragraph, tiedParagraph]);
		expect(sentence.attributes).toEqual([type, role]);
	});

	test('keeps configured within ordering and model updates', async () => {
		const options = [
			{ value: 'p', label: 'Paragraph' },
			{ value: '', label: 'Document' },
			{ value: 's', label: 'Sentence', attributes: [{ value: 'type', label: 'Type' }] },
		];
		const wrapper = mount(WithinField, {
			props: {
				id: 'within',
				htmlId: 'within_1',
				modelValue: { element: 's', attributes: { existing: 'value' } },
				options,
			},
		});

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Paragraph', 'Document', 'Sentence']);
		expect(toRaw((wrapper.vm.$ as unknown as { setupState: { sortedOptions: WithinFieldOption[] } }).setupState.sortedOptions)).toBe(options);

		await wrapper.get('#within_1_type').setValue('quote');
		await wrapper.findAll('button')[0].trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ element: 's', attributes: { existing: 'value', type: 'quote' } }], [{ element: 'p', attributes: {} }]]);
	});

	test('reactively resolves and sorts within labels and titles', async () => {
		const locale = ref<'en' | 'nl'>('en');
		const labels = {
			document: { en: 'Document', nl: 'Document' },
			paragraph: { en: 'Zulu', nl: 'Alpha' },
			sentence: { en: 'Alpha', nl: 'Zulu' },
			role: { en: 'Zulu attribute', nl: 'Alpha attribute' },
			type: { en: 'Alpha attribute', nl: 'Zulu attribute' },
		};
		const text = (key: keyof typeof labels) => () => labels[key][locale.value];
		const wrapper = mount(WithinField, {
			props: {
				id: 'within',
				htmlId: 'within_1',
				modelValue: { element: 's', attributes: {} },
				options: [
					{ value: 'p', label: text('paragraph') },
					{
						value: 's',
						label: text('sentence'),
						title: () => `${locale.value}:sentence-title`,
						attributes: [
							{ value: 'role', label: text('role') },
							{ value: 'type', label: text('type') },
						],
					},
					{ value: '', label: text('document') },
				],
				sortOptions: true,
			},
		});

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Document', 'Alpha', 'Zulu']);
		expect(wrapper.findAll('.blf-within-attributes label').map(label => label.text())).toEqual(['Alpha attribute', 'Zulu attribute']);
		expect(wrapper.findAll('.blf-within-attributes input').map(input => input.attributes('id'))).toEqual(['within_1_type', 'within_1_role']);
		expect(wrapper.findAll('button')[1].attributes('title')).toBe('en:sentence-title');

		locale.value = 'nl';
		await nextTick();

		expect(wrapper.findAll('button').map(button => button.text())).toEqual(['Document', 'Alpha', 'Zulu']);
		expect(wrapper.findAll('.blf-within-attributes label').map(label => label.text())).toEqual(['Alpha attribute', 'Zulu attribute']);
		expect(wrapper.findAll('.blf-within-attributes input').map(input => input.attributes('id'))).toEqual(['within_1_role', 'within_1_type']);
		expect(wrapper.findAll('button')[2].attributes('title')).toBe('nl:sentence-title');
	});
});
