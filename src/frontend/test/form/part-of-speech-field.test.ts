// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';

import { findTagsetValue, getVisibleSubAnnotationValues, summarizeAnnotationPosState, type AnnotationPosFieldState } from '@/features/form/fields/annotation-pos-field';
import { type Tagset } from '@/types/apptypes';

import AnnotationPosField from '@/features/form/fields/AnnotationPosField.vue';

enableAutoUnmount(afterEach);

const baseProps = {
	id: 'field',
	htmlId: 'field_1',
	displayName: 'Field',
};

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
		expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
		await wrapper.findAll('.list-group.main button')[0].trigger('click');
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('Noun');
		await wrapper.setProps({ modelValue: {} });
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('Noun');

		await wrapper.get('.modal-header .close').trigger('click');
		expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toBe('');
		expect(wrapper.emitted('update:modelValue')).toBeUndefined();
	});

	test('commits edited draft values without mutating the model value', async () => {
		const modelValue = { pos: ['N'], number: ['sg'] };
		const wrapper = mount(AnnotationPosField, {
			props: { ...baseProps, annotationId: 'pos', tagset, modelValue },
		});

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		const checkboxes = wrapper.findAll('input[type="checkbox"]');
		await checkboxes[0].setValue(false);
		await checkboxes[1].setValue(true);
		await wrapper.get('.modal-footer .btn-primary').trigger('click');
		const committed = wrapper.emitted('update:modelValue')?.[0][0] as AnnotationPosFieldState | undefined;
		expect(committed).toEqual({ pos: ['N'], number: ['pl'] });
		expect(modelValue).toEqual({ pos: ['N'], number: ['sg'] });
	});

	test('resets only the draft and clears the committed selection explicitly', async () => {
		const modelValue = { pos: ['N'], number: ['sg'] };
		const wrapper = mount(AnnotationPosField, {
			props: { ...baseProps, annotationId: 'pos', tagset, modelValue },
		});

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		await wrapper.find('.modal-footer .btn-default').trigger('click');
		await wrapper.get('.modal-header .close').trigger('click');
		expect(wrapper.get('input[readonly]').element.getAttribute('value')).toContain('Noun');
		expect(wrapper.emitted('update:modelValue')).toBeUndefined();

		await wrapper.get('.input-group-btn button:last-child').trigger('click');
		await wrapper.find('.modal-footer .btn-default').trigger('click');
		await wrapper.get('.modal-footer .btn-primary').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{}]]);
		expect(modelValue).toEqual({ pos: ['N'], number: ['sg'] });

		await wrapper.get('.input-group-btn button:first-child').trigger('click');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{}], [{}]]);
		expect(modelValue).toEqual({ pos: ['N'], number: ['sg'] });
	});
});
