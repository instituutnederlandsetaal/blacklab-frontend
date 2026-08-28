// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import Axios from 'axios';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { createDefaultCqlQueryBuilderData, type CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import { findTagsetValue, getVisibleSubAnnotationValues, summarizeAnnotationPosState, type AnnotationPosFieldState } from '@/features/form/fields/annotation-pos-field';
import { createDefaultCheckboxFieldState } from '@/features/form/fields/generic/checkbox-field';
import { createDefaultDateFieldState, DateUtils } from '@/features/form/fields/generic/date-field';
import { createLexiconLookup } from '@/features/form/fields/generic/lexicon-field';
import { createDefaultRadioFieldState } from '@/features/form/fields/generic/radio-field';
import type { Tagset } from '@/types/apptypes';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';
import CheckboxField from '@/features/form/fields/generic/CheckboxField.vue';
import DateField from '@/features/form/fields/generic/DateField.vue';
import LexiconField from '@/features/form/fields/generic/LexiconField.vue';
import NumberField from '@/features/form/fields/generic/NumberField.vue';
import RadioField from '@/features/form/fields/generic/RadioField.vue';
import RangeField from '@/features/form/fields/generic/RangeField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import QueryBuilderField from '@/features/form/fields/QueryBuilderField.vue';
import Modal from '@/shared/ui/Modal.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const baseProps = {
	id: 'field',
	htmlId: 'field_1',
	displayName: 'Field',
};

const DebugWithSlot = defineComponent({
	setup(_props, { slots }) {
		return () => h('span', slots.default?.());
	},
});

const tagset: Tagset = {
	values: {
		noun: { value: 'N', displayName: 'Noun', subAnnotationIds: ['number', 'missing'] },
		verb: { value: 'V', displayName: 'Verb', subAnnotationIds: [] },
	},
	subAnnotations: {
		number: {
			id: 'number',
			displayName: 'Number',
			values: [
				{ value: 'sg', displayName: 'Singular', pos: ['N'] },
				{ value: 'pl', displayName: 'Plural' },
				{ value: 'verb-only', displayName: 'Verb only', pos: ['V'] },
			],
		},
	},
};

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('generic form field components', () => {
	test('checkbox and radio fields render deferred option text and emit edits', async () => {
		const options = [
			{ value: 'a', label: () => 'Alpha', title: () => 'First option' },
			{ value: 'b', label: 'Beta' },
		];
		const checkbox = mount(CheckboxField, {
			props: { ...baseProps, modelValue: ['a'], options, description: 'Choose several' },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});

		expect(createDefaultCheckboxFieldState()).toEqual([]);
		expect(checkbox.get('legend').text()).toContain('Field [field]');
		expect(checkbox.get('.help-block').text()).toBe('Choose several');
		expect(checkbox.findAll('label')[0].attributes('title')).toBe('First option');
		await checkbox.findAll('input')[1].setValue(true);
		await checkbox.findAll('input')[0].setValue(false);
		await checkbox.setProps({ description: undefined });
		expect(checkbox.emitted('update:modelValue')).toEqual([[['a', 'b']], [[]]]);

		const radio = mount(RadioField, {
			props: { ...baseProps, modelValue: 'a', options, description: 'Choose one', showLabel: false },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});
		expect(createDefaultRadioFieldState()).toBe('');
		await radio.findAll('input')[1].trigger('click');
		(radio.findAll('input')[0].element as HTMLInputElement).checked = false;
		await radio.findAll('input')[0].trigger('input', { key: ' ' });
		await radio.setProps({ description: undefined, showLabel: true });
		expect(radio.get('legend').text()).toContain('[field]');
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
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});

		expect(wrapper.get('label.control-label').text()).toContain('1900-01-02 to 2099-12-31');
		const inputs = wrapper.findAll('input');
		for (const [index, value] of ['2020', '6', '7', '2021', '8', '9'].entries()) {
			await inputs[index].setValue(value);
		}
		await wrapper.get('button[value="permissive"]').trigger('click');
		await wrapper.setProps({ showLabel: false });
		expect(wrapper.emitted('update:modelValue')).toEqual([
			[{ ...modelValue, startDate: { ...modelValue.startDate, y: 2020 } }],
			[{ ...modelValue, startDate: { ...modelValue.startDate, m: 6 } }],
			[{ ...modelValue, startDate: { ...modelValue.startDate, d: 7 } }],
			[{ ...modelValue, endDate: { ...modelValue.endDate, y: 2021 } }],
			[{ ...modelValue, endDate: { ...modelValue.endDate, m: 8 } }],
			[{ ...modelValue, endDate: { ...modelValue.endDate, d: 9 } }],
			[{ ...modelValue, mode: 'permissive' }],
		]);

		expect(createDefaultDateFieldState()).toEqual({
			startDate: { y: '', m: '', d: '' },
			endDate: { y: '', m: '', d: '' },
			mode: 'strict',
		});
		expect(DateUtils.dateValueToString(null, 'start')).toBe('');
		expect(DateUtils.dateValueToString({ y: 'bad', m: '', d: '' }, 'start')).toBe('');
		expect(DateUtils.dateValueToString({ y: '24', m: '', d: '' }, 'start')).toBe('00240101');
		expect(DateUtils.dateValueToString({ y: '2024', m: '02', d: '' }, 'end')).toBe('20240229');
		expect(DateUtils.dateValueToDisplayString(undefined)).toBe('');
		expect(DateUtils.normalizeBoundaryDate('not-a-date')).toBeNull();
		expect(DateUtils.normalizeBoundaryDate({ y: '1', m: '2', d: '3' })).toEqual({ y: '1', m: '2', d: '3' });
	});

	test('range field supports text and numeric ranges, locked modes, and all edits', async () => {
		const modelValue = { low: '1', high: '9', mode: 'strict' as const };
		const wrapper = mount(RangeField, {
			props: { ...baseProps, modelValue, showMode: true, description: 'A numeric range' },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});

		expect(wrapper.findAll('input').every(input => input.attributes('type') === 'number')).toBe(true);
		await wrapper.findAll('input')[0].setValue('2');
		await wrapper.findAll('input')[1].setValue('8');
		await wrapper.get('button[value="permissive"]').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...modelValue, low: '2' }], [{ ...modelValue, high: '8' }], [{ ...modelValue, mode: 'permissive' }]]);

		const locked = mount(RangeField, {
			props: { ...baseProps, modelValue, mode: 'strict', inputType: 'text', showLabel: false },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
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
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});
		expect(single.get('label.control-label').text()).toContain('[field]');
		expect(single.get('.help-block').text()).toBe('One value');
		expect(single.findComponent(SelectPicker).props('modelValue')).toBe('a');
		single.findComponent(SelectPicker).vm.$emit('update:modelValue', ['b']);
		await nextTick();
		await single.setProps({ description: undefined });
		expect(single.emitted('update:modelValue')).toEqual([['b']]);

		const multiple = mount(SelectField, {
			props: { ...baseProps, modelValue: 'a', options, multiple: true, showLabel: false },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});
		expect(multiple.findComponent(SelectPicker).props('modelValue')).toEqual(['a']);
		multiple.findComponent(SelectPicker).vm.$emit('update:modelValue', 'b');
		multiple.findComponent(SelectPicker).vm.$emit('update:modelValue', null);
		await nextTick();
		expect(multiple.emitted('update:modelValue')).toEqual([[['b']], [[]]]);
	});

	test('text field emits typed, case-sensitive, uploaded, and cleared values', async () => {
		const wrapper = mount(TextField, {
			props: { ...baseProps, modelValue: { value: 'old', caseSensitive: false }, caseSensitive: true, description: 'Words' },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});
		await wrapper.get('input[type="text"]').setValue('typed');
		await wrapper.get('input[type="checkbox"]').setValue(true);

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
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: 'one|two|three', caseSensitive: false }]);

		Object.defineProperty(fileInput.element, 'files', { configurable: true, value: [] });
		await fileInput.trigger('change');
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: '', caseSensitive: false }]);

		const autocomplete = mount(TextField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, autocomplete: vi.fn(async () => []), showLabel: false },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});
		expect(autocomplete.find('input[type="text"]').exists()).toBe(true);
	});

	test('number field handles unbounded values and repairs non-numeric input', async () => {
		const wrapper = mount(NumberField, {
			props: { ...baseProps, modelValue: 4, min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY, step: 0, description: 'Count' },
			global: { stubs: { Debug: DebugWithSlot, debug: DebugWithSlot } },
		});
		const input = wrapper.get('input');
		expect(input.attributes('step')).toBe('1');
		expect(input.attributes('min')).toBeUndefined();
		await input.setValue('5.6');
		expect(wrapper.emitted('update:modelValue')).toEqual([[6]]);
		await input.setValue('');
		expect((input.element as HTMLInputElement).value).toBe('4');
		await wrapper.setProps({ showLabel: false, description: undefined });
	});
});

describe('part-of-speech field', () => {
	test('covers tagset lookup, filtering, and summaries', () => {
		const state = { pos: ['N'], number: ['sg', 'verb-only'] };
		expect(findTagsetValue(tagset, null)).toBeNull();
		expect(findTagsetValue(tagset, 'noun')?.value).toBe('N');
		expect(findTagsetValue(tagset, 'V')?.displayName).toBe('Verb');
		expect(findTagsetValue(tagset, 'missing')).toBeNull();
		expect(getVisibleSubAnnotationValues(tagset, null, 'number')).toEqual([]);
		expect(getVisibleSubAnnotationValues(tagset, 'N', 'missing')).toEqual([]);
		expect(getVisibleSubAnnotationValues(tagset, 'N', 'number').map(value => value.value)).toEqual(['sg', 'pl']);
		expect(summarizeAnnotationPosState({ ...baseProps, annotationId: 'pos', tagset }, {})).toBe('');
		expect(summarizeAnnotationPosState({ ...baseProps, annotationId: 'pos', tagset }, { pos: ['V'] })).toBe('Verb');
		expect(summarizeAnnotationPosState({ ...baseProps, annotationId: 'pos', tagset, subAnnotationLabels: { number: () => 'Features' } }, state)).toBe('Noun; Features: Singular');
	});

	test('reflects external replacements while closed and keeps open edits isolated until cancel', async () => {
		const wrapper = mount(AnnotationPosField, {
			props: {
				...baseProps,
				annotationId: 'pos',
				tagset,
				modelValue: { pos: ['N'], number: ['sg'] },
				description: 'Part of speech',
			},
		});
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toContain('Noun');
		await wrapper.setProps({ modelValue: { pos: ['V'] } });
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('Verb');

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		expect(wrapper.findComponent(Modal).exists()).toBe(true);
		await wrapper.findAll('.list-group.main button')[0].trigger('click');
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('Noun');
		await wrapper.setProps({ modelValue: {} });
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('Noun');

		wrapper.findComponent(Modal).vm.$emit('close');
		await nextTick();
		expect(wrapper.findComponent(Modal).exists()).toBe(false);
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('');
		expect(wrapper.emitted('update:modelValue')).toBeUndefined();
	});

	test('commits a cloned draft without mutating the model value', async () => {
		const modelValue = { pos: ['N'], number: ['sg'] };
		const wrapper = mount(AnnotationPosField, {
			props: { ...baseProps, annotationId: 'pos', tagset, modelValue },
		});

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		const checkboxes = wrapper.findAll('input[type="checkbox"]');
		await checkboxes[0].setValue(false);
		await checkboxes[1].setValue(true);
		wrapper.findComponent(Modal).vm.$emit('confirm');
		await nextTick();
		const committed = wrapper.emitted('update:modelValue')?.[0][0] as AnnotationPosFieldState | undefined;
		expect(committed).toEqual({ pos: ['N'], number: ['pl'] });
		expect(committed).not.toBe(modelValue);
		expect(committed?.pos).not.toBe(modelValue.pos);
		expect(modelValue).toEqual({ pos: ['N'], number: ['sg'] });
	});

	test('resets only the draft and clears the committed selection explicitly', async () => {
		const modelValue = { pos: ['N'], number: ['sg'] };
		const wrapper = mount(AnnotationPosField, {
			props: { ...baseProps, annotationId: 'pos', tagset, modelValue },
		});

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		await wrapper.find('.modal-footer .btn-default').trigger('click');
		wrapper.findComponent(Modal).vm.$emit('close');
		await nextTick();
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toContain('Noun');
		expect(wrapper.emitted('update:modelValue')).toBeUndefined();

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		await wrapper.find('.modal-footer .btn-default').trigger('click');
		wrapper.findComponent(Modal).vm.$emit('confirm');
		await nextTick();
		expect(wrapper.emitted('update:modelValue')).toEqual([[{}]]);
		expect(modelValue).toEqual({ pos: ['N'], number: ['sg'] });

		await wrapper.get('.input-group-btn button:first-child').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{}], [{}]]);
		expect(modelValue).toEqual({ pos: ['N'], number: ['sg'] });
	});
});

describe('lexicon field', () => {
	test('debounces lookup, filters parts of speech, and maintains selected words', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(async () => ({
			posOptions: { noun: true, verb: true },
			wordList: [
				{ lemma: 'water', pos: ['noun'], count: 3, word: 'water', selected: false },
				{ lemma: 'water', pos: ['noun'], count: 0, word: 'water fall', selected: false },
				{ lemma: 'water', pos: ['verb'], count: 2, word: 'water|?', selected: false },
			],
		}));
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup, description: 'Lexicon words' },
			global: { stubs: { Debug: DebugWithSlot, Spinner: true, debug: DebugWithSlot } },
		});

		await wrapper.get('input[type="text"]').setValue('water');
		await wrapper.setProps({ modelValue: { value: 'water', caseSensitive: false } });
		expect(wrapper.find('.lexicon-spinner').exists()).toBe(true);
		await vi.advanceTimersByTimeAsync(1500);
		await nextTick();
		expect(lookup).toHaveBeenCalledWith('water');
		expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(5);

		await wrapper.findAll('button')[0].trigger('click');
		await nextTick();
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: 'water|water\\|\\?', caseSensitive: false }]);
		await wrapper.findAll('button')[1].trigger('click');
		await nextTick();
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ value: '', caseSensitive: false }]);

		const posInputs = wrapper.findAll('input[type="checkbox"]').slice(-2);
		await posInputs[1].setValue(false);
		await nextTick();
		expect(wrapper.findAll('label[title]').map(label => label.attributes('title'))).not.toContain('water|? (2)');
	});

	test('clears invalid and empty lookups and recovers from rejected requests', async () => {
		vi.useFakeTimers();
		const lookup = vi.fn(() => Promise.reject(new Error('offline')));
		const wrapper = mount(LexiconField, {
			props: { ...baseProps, modelValue: { value: '', caseSensitive: false }, lookup, showLabel: false },
			global: { stubs: { Debug: DebugWithSlot, Spinner: true, debug: DebugWithSlot } },
		});

		await wrapper.setProps({ modelValue: { value: 'two words', caseSensitive: false } });
		await wrapper.setProps({ modelValue: { value: 'word', caseSensitive: false } });
		await vi.advanceTimersByTimeAsync(1500);
		await nextTick();
		expect(wrapper.find('.lexicon-spinner').exists()).toBe(false);
		await wrapper.setProps({ modelValue: { value: '', caseSensitive: false } });
		expect(wrapper.findAll('label[title]')).toHaveLength(0);
	});

	test('builds lookup results from service lemmata, wordforms, and frequencies', async () => {
		const get = vi.spyOn(Axios, 'get');
		get
			.mockResolvedValueOnce({ data: { message: 'OK', lemmata_list: [{ found_lemmata: [{ lemma: 'cat', lemma_id: '1', pos: 'noun' }] }] } })
			.mockResolvedValueOnce({
				data: {
					message: 'OK',
					lemmata_list: [{ found_lemmata: [{ lemma: 'cat', lemma_id: '1', pos: 'noun' }] }, { found_lemmata: [{ lemma: 'run', lemma_id: '2', pos: '' }] }],
				},
			})
			.mockResolvedValueOnce({ data: { message: 'OK', wordforms_list: [{ found_wordforms: ['cat', 'cats'] }] } })
			.mockResolvedValueOnce({ data: { message: 'ERROR', wordforms_list: [{ found_wordforms: ['ignored'] }] } });
		const getTermFrequencies = vi.fn(async () => ({ cat: 5, cats: 4, run: 2 }));
		const lookup = createLexiconLookup({
			database: 'test',
			getTermFrequencies,
			service: {
				getLemmaIdFromWordform: '/wordform',
				getLemmaIdFromLemma: '/lemma',
				getWordformsFromLemmaId: '/forms',
				caseSensitive: true,
			},
		});

		const result = await lookup('cats');
		expect(get).toHaveBeenCalledTimes(4);
		expect(getTermFrequencies).toHaveBeenCalledWith(expect.arrayContaining(['cat', 'cats']));
		expect(result.posOptions).toEqual({ 'cat (noun)': true, 'run (unknown)': true });
		expect(result.wordList.map(word => word.word)).toEqual(expect.arrayContaining(['cat', 'cats']));
	});

	test('falls back to a direct corpus term and returns an empty result when absent', async () => {
		const get = vi.spyOn(Axios, 'get');
		get.mockResolvedValue({ data: { message: 'OK', lemmata_list: [{ found_lemmata: [] }] } });
		const present = createLexiconLookup({ database: 'test', getTermFrequencies: async () => ({ water: 7 }) });
		const absent = createLexiconLookup({ database: 'test', getTermFrequencies: async () => ({}) });

		expect(await present('water')).toEqual({
			posOptions: { water: true },
			wordList: [{ lemma: 'water', pos: ['water'], count: 7, word: 'water', selected: false }],
		});
		expect(await absent('missing')).toEqual({ posOptions: {}, wordList: [] });
	});
});

describe('query builder field', () => {
	test('passes state and options to the builder and forwards updates', async () => {
		const modelValue = createDefaultCqlQueryBuilderData('word');
		const options = {
			indexId: 'test',
			defaultAnnotationId: 'word',
			textDirection: 'ltr',
			allAnnotationsMap: {},
			autocomplete: async () => [],
			annotationOptions: [],
			operatorOptions: [],
			comparatorOptions: [],
		} satisfies CqlQueryBuilderOptions;
		const BuilderStub = defineComponent({
			props: ['modelValue', 'options', 'disabled'],
			emits: ['update:modelValue'],
			template: '<button class="builder" @click="$emit(\'update:modelValue\', { tokens: [] })">edit</button>',
		});
		const wrapper = mount(QueryBuilderField, {
			props: { ...baseProps, modelValue, options },
			global: { stubs: { CqlQueryBuilder: BuilderStub } },
		});

		expect(wrapper.classes()).toContain('blf-query-builder-field');
		await wrapper.get('.builder').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ tokens: [] }]]);
	});
});
