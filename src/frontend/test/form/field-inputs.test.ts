// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import NumberField from '@/features/form/fields/generic/NumberField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

afterEach(() => vi.unstubAllGlobals());

const baseProps = {
	id: 'field',
	htmlId: 'field_1',
	displayName: 'Field',
};

describe('field input values', () => {
	test('checkbox and radio fields render deferred option text and emit edits', async () => {
		const options = [
			{ value: 'a', label: () => 'Alpha', title: () => 'First option' },
			{ value: 'b', label: 'Beta' },
		];
		const checkbox = mount(CheckboxField, {
			props: { ...baseProps, modelValue: ['a'], options, description: 'Choose several' },
		});

		expect(checkbox.get('legend').text()).toBe('Field');
		expect(checkbox.get('.help-block').text()).toBe('Choose several');
		expect(checkbox.findAll('label')[0].attributes('title')).toBe('First option');
		await checkbox.findAll('input')[1].setValue(true);
		await checkbox.findAll('input')[0].setValue(false);
		expect(checkbox.emitted('update:modelValue')).toEqual([[['a', 'b']], [[]]]);

		const radio = mount(RadioField, {
			props: { ...baseProps, modelValue: 'a', options, description: 'Choose one', showLabel: false },
		});
		await radio.findAll('input')[1].trigger('click');
		(radio.findAll('input')[0].element as HTMLInputElement).checked = false;
		await radio.findAll('input')[0].trigger('input', { key: ' ' });
		await radio.setProps({ showLabel: true });
		expect(radio.get('legend').text()).toBe('Field');
		expect(radio.emitted('update:modelValue')).toEqual([['b'], ['']]);
	});

	test('date field normalizes boundaries and emits every editable part and mode', async () => {
		const modelValue = {
			startDate: { y: '2024', m: '02', d: '03' },
			endDate: { y: '2025', m: '04', d: '05' },
			mode: 'strict' as const,
		};
		const wrapper = mount(DateField, {
			props: {
				...baseProps,
				modelValue,
				range: true,
				min: new Date(1900, 0, 2),
				max: '2099-12-31',
				description: 'Publication period',
			},
		});

		expect(wrapper.get('label.control-label').text()).toContain('1900-01-02 to 2099-12-31');
		const inputs = wrapper.findAll('input');
		for (const [index, value] of ['2020', '6', '7', '2021', '8', '9'].entries()) {
			await inputs[index].setValue(value);
		}
		await wrapper.get('button[value="permissive"]').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([
			[{ ...modelValue, startDate: { ...modelValue.startDate, y: 2020 } }],
			[{ ...modelValue, startDate: { ...modelValue.startDate, m: 6 } }],
			[{ ...modelValue, startDate: { ...modelValue.startDate, d: 7 } }],
			[{ ...modelValue, endDate: { ...modelValue.endDate, y: 2021 } }],
			[{ ...modelValue, endDate: { ...modelValue.endDate, m: 8 } }],
			[{ ...modelValue, endDate: { ...modelValue.endDate, d: 9 } }],
			[{ ...modelValue, mode: 'permissive' }],
		]);
	});

	test('range field supports text and numeric ranges, locked modes, and all edits', async () => {
		const modelValue = { low: '1', high: '9', mode: 'strict' as const };
		const wrapper = mount(RangeField, {
			props: { ...baseProps, modelValue, showMode: true, description: 'A numeric range' },
		});

		expect(wrapper.findAll('input').every(input => input.attributes('type') === 'number')).toBe(true);
		await wrapper.findAll('input')[0].setValue('2');
		await wrapper.findAll('input')[1].setValue('8');
		await wrapper.get('button[value="permissive"]').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...modelValue, low: '2' }], [{ ...modelValue, high: '8' }], [{ ...modelValue, mode: 'permissive' }]]);

		const locked = mount(RangeField, {
			props: { ...baseProps, modelValue, mode: 'strict', inputType: 'text', showLabel: false },
		});
		expect(locked.find('button').exists()).toBe(false);
		expect(locked.findAll('input').every(input => input.attributes('type') === 'text')).toBe(true);
	});

	test('select field normalizes single and multiple picker values in both directions', async () => {
		const options = [
			{ value: 'a', label: 'Alpha' },
			{ value: 'b', label: 'Beta' },
		];
		const single = mount(SelectField, {
			props: { ...baseProps, modelValue: ['a'], options, description: 'One value' },
			global: { stubs: { SelectPicker: true } },
		});
		expect(single.get('label.control-label').text()).toBe('Field');
		expect(single.get('.help-block').text()).toBe('One value');
		const singlePicker = single.getComponent(SelectPicker);
		expect(singlePicker.props('modelValue')).toBe('a');
		singlePicker.vm.$emit('update:modelValue', 'b');
		expect(single.emitted('update:modelValue')).toEqual([['b']]);

		const multiple = mount(SelectField, {
			props: { ...baseProps, modelValue: 'a', options, multiple: true, showLabel: false },
			global: { stubs: { SelectPicker: true } },
		});
		const multiplePicker = multiple.getComponent(SelectPicker);
		expect(multiplePicker.props()).toMatchObject({ modelValue: ['a'], multiple: true });
		multiplePicker.vm.$emit('update:modelValue', ['a', 'b']);
		await multiple.setProps({ modelValue: ['a', 'b'] });
		multiplePicker.vm.$emit('update:modelValue', ['b']);
		expect(multiple.emitted('update:modelValue')).toEqual([[['a', 'b']], [['b']]]);
	});

	test('text field emits typed, case-sensitive, uploaded, and cleared values', async () => {
		const wrapper = mount(TextField, {
			props: { ...baseProps, modelValue: { value: 'old', caseSensitive: false }, caseSensitive: true, description: 'Words' },
		});
		await wrapper.get('input[type="text"]').setValue('typed');
		await wrapper.get('input[type="checkbox"]').setValue(true);
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ value: 'typed', caseSensitive: false }], [{ value: 'old', caseSensitive: true }]]);

		const fileInput = wrapper.get('input[type="file"]');
		vi.stubGlobal(
			'FileReader',
			class {
				result: string | null = null;
				onload: null | (() => void) = null;
				readAsText() {
					this.result = 'one\ntwo three';
					this.onload?.();
				}
			},
		);
		Object.defineProperty(fileInput.element, 'files', {
			configurable: true,
			value: [new File(['one\ntwo three'], 'words.txt', { type: 'text/plain' })],
		});
		await fileInput.trigger('change');
		await flushPromises();
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: 'one|two|three', caseSensitive: false }]);

		Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [] });
		await fileInput.trigger('change');
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: '', caseSensitive: false }]);

		const autocomplete = mount(TextField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, autocomplete: vi.fn(async () => []), showLabel: false },
		});
		expect(autocomplete.find('input[type="text"]').exists()).toBe(true);
	});

	test('number field handles unbounded values and falls back from an invalid step', async () => {
		const wrapper = mount(NumberField, {
			props: { ...baseProps, modelValue: 4, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY, step: 0, description: 'Count' },
		});
		const input = wrapper.get('input');
		expect(input.attributes('step')).toBe('1');
		expect(input.attributes('min')).toBeUndefined();
		await input.setValue('5.6');
		expect(wrapper.emitted('update:modelValue')).toEqual([[6]]);
	});
});

describe('query field input contracts', () => {
	test('raw CQL edits emit the entered query', async () => {
		const wrapper = mount(RawCqlField, { props: { id: 'query', htmlId: 'query', modelValue: '' } });
		expect(wrapper.get('a.help').attributes('href')).toBe('https://blacklab.ivdnt.org/guide/corpus-query-language.html');
		await wrapper.get('textarea').setValue('[lemma="house"]');
		expect(wrapper.emitted('update:modelValue')).toEqual([['[lemma="house"]']]);
	});

	test('within edits preserve attributes until the selected element changes', async () => {
		const initial = { element: 's', attributes: { speaker: 'Alice', type: 'quote' } };
		const wrapper = mount(WithinField, {
			props: {
				id: 'within',
				htmlId: 'within',
				modelValue: initial,
				options: [
					{ value: '', label: 'Document' },
					{
						value: 's',
						label: 'Sentence',
						attributes: [
							{ value: 'speaker', label: 'Speaker' },
							{ value: 'type', label: 'Type' },
						],
					},
					{ value: 'p', label: 'Paragraph' },
				],
			},
		});
		await wrapper.get('#within_speaker').setValue('Bob');
		expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([{ element: 's', attributes: { speaker: 'Bob', type: 'quote' } }]);
		expect(initial.attributes.speaker).toBe('Alice');
		await wrapper.findAll('button')[2].trigger('click');
		expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([{ element: 'p', attributes: {} }]);
		await wrapper.findAll('button')[0].trigger('click');
		expect(wrapper.emitted('update:modelValue')?.[2]).toEqual([{ element: null, attributes: {} }]);
	});
});

describe('numeric input normalization', () => {
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
});

describe('reactive option rendering', () => {
	test('renders and sorts original within options reactively', async () => {
		const locale = ref<'en' | 'nl'>('en');
		const type = { value: 'type', label: () => (locale.value === 'en' ? 'Zulu type' : 'Alpha type'), title: 'Type title', disabled: true };
		const role = { value: 'role', label: () => (locale.value === 'en' ? 'Alpha role' : 'Zulu role') };
		const sentence = { value: 's', label: () => (locale.value === 'en' ? 'Zulu' : 'Aardvark'), title: () => `${locale.value}:title`, attributes: [type, role], metadata: 'kept' };
		const options = [sentence, { value: '', label: 'Document' }, { value: 'p', label: 'Alpha', title: 'first' }, { value: 'p2', label: 'Alpha', title: 'second' }];
		Object.freeze(type);
		Object.freeze(role);
		Object.freeze(sentence.attributes);
		Object.freeze(sentence);
		Object.freeze(options);
		const wrapper = mount(WithinField, {
			props: {
				id: 'within',
				htmlId: 'within_1',
				modelValue: { element: 's', attributes: { existing: 'value' } },
				options,
			},
		});

		const renderedOptions = () => wrapper.findAll('button').map(button => `${button.text()}:${button.attributes('title')}`);
		expect(renderedOptions()).toEqual(['Zulu:en:title', 'Document:undefined', 'Alpha:first', 'Alpha:second']);

		await wrapper.setProps({ sortOptions: true });
		expect(renderedOptions()).toEqual(['Document:undefined', 'Alpha:first', 'Alpha:second', 'Zulu:en:title']);
		expect(wrapper.findAll('.blf-within-attributes input').map(input => input.attributes('id'))).toEqual(['within_1_role', 'within_1_type']);

		locale.value = 'nl';
		await nextTick();
		expect(renderedOptions()).toEqual(['Document:undefined', 'Aardvark:nl:title', 'Alpha:first', 'Alpha:second']);
		expect(wrapper.findAll('.blf-within-attributes input').map(input => input.attributes('id'))).toEqual(['within_1_type', 'within_1_role']);

		await wrapper.get('#within_1_type').setValue('quote');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ element: 's', attributes: { existing: 'value', type: 'quote' } }]]);
		expect([sentence.value, sentence.metadata, ...sentence.attributes.map(attribute => attribute.value)]).toEqual(['s', 'kept', 'type', 'role']);
	});
});
