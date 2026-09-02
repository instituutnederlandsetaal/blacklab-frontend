// @vitest-environment jsdom

import { shallowMount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import type { CollocationFieldState } from '@/features/form/fields/collocation-field';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import CollocationField from '@/features/form/fields/CollocationField.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const emptyPattern = {
	mode: 'simple' as const,
	simple: { annotationId: 'word', fieldState: { value: '' } },
	advanced: { tokens: [] },
	expert: '',
};
const relationState: CollocationFieldState = {
	keyword: { ...emptyPattern, mode: 'expert', expert: '[word="ship"]' },
	collocate: { enabled: false, pattern: structuredClone(emptyPattern) },
	before: 5,
	after: 5,
	within: '',
	colltype: 'relsources',
	reltype: 'aligns',
	annotation: 'word',
	sensitive: false,
};

function mountField() {
	return shallowMount(CollocationField, {
		props: {
			id: 'collocations',
			htmlId: 'collocations_1',
			modelValue: relationState,
			annotationOptions: [
				{ value: 'word', label: () => 'Word' },
				{ value: 'lemma', label: () => 'Lemma' },
			],
			defaultAnnotation: 'word',
			createAnnotationField: () => ({}) as FormFieldNode,
			advancedField: {} as FormFieldNode,
			expertField: {} as FormFieldNode,
			withinOptions: [],
			defaultWithin: '',
			parsePattern: async () => null,
		},
	});
}

describe('collocation field', () => {
	test('renders structured proximity controls while retaining a restored relation state', async () => {
		const wrapper = mountField();

		expect(wrapper.find('#collocations_1-type').exists()).toBe(false);
		expect(wrapper.find('#collocations_1-reltype').exists()).toBe(false);
		expect(wrapper.find('option[value="relsources"]').exists()).toBe(false);
		expect(wrapper.find('option[value="reltargets"]').exists()).toBe(false);
		expect(wrapper.find('#collocations_1_before').exists()).toBe(true);
		expect(wrapper.find('#collocations_1_after').exists()).toBe(true);
		expect(wrapper.find('#collocations_1_scorer').exists()).toBe(false);

		await wrapper.get('#collocations_1_before').setValue('3');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...relationState, before: 3 }]]);
	});

	test('enables a collocate restriction without discarding its saved draft', async () => {
		const wrapper = mountField();
		const toggle = wrapper.get('input[type="checkbox"]');

		expect(toggle.attributes()).toMatchObject({ 'aria-controls': 'collocations_1_collocate_restriction', 'aria-expanded': 'false' });
		await toggle.setValue(true);
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...relationState, collocate: { ...relationState.collocate, enabled: true } }]]);
	});

	test('uses the shared picker for the collocate annotation and shows sensitivity directly', async () => {
		const wrapper = mountField();
		const picker = wrapper.getComponent(SelectPicker);

		expect(picker.props()).toMatchObject({ modelValue: 'word', dataWidth: '100%', hideEmpty: true });
		expect(wrapper.find('details').exists()).toBe(false);
		expect(wrapper.text()).toContain('collocations.sensitive');

		picker.vm.$emit('update:modelValue', 'lemma');
		await wrapper.vm.$nextTick();
		expect(wrapper.emitted('update:modelValue')).toContainEqual([{ ...relationState, annotation: 'lemma' }]);
	});
});
