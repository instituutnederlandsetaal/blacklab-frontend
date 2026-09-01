// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import type { CollocationFieldState } from '@/features/form/fields/collocation-field';

import CollocationField from '@/features/form/fields/CollocationField.vue';

const relationState: CollocationFieldState = {
	patt: '[word="ship"]',
	collpatt: '',
	colltype: 'relsources',
	context: '5',
	within: '',
	reltype: 'aligns',
	annotation: 'word',
	sensitive: false,
	scorertype: 'coll-dice',
};

describe('collocation field', () => {
	test('renders only proximity controls while retaining a persisted relation state', async () => {
		const wrapper = mount(CollocationField, {
			props: {
				id: 'collocations',
				htmlId: 'collocations_1',
				modelValue: relationState,
				annotationOptions: [{ value: 'word', label: () => 'Word' }],
				defaultAnnotation: 'word',
			},
		});

		expect(wrapper.find('#collocations_1-type').exists()).toBe(false);
		expect(wrapper.find('#collocations_1-reltype').exists()).toBe(false);
		expect(wrapper.find('option[value="relsources"]').exists()).toBe(false);
		expect(wrapper.find('option[value="reltargets"]').exists()).toBe(false);
		expect(wrapper.find('#collocations_1-context').exists()).toBe(true);
		expect(wrapper.find('#collocations_1-within').exists()).toBe(true);

		await wrapper.get('#collocations_1-context').setValue('3:4');
		expect(wrapper.emitted('update:modelValue')).toEqual([[{ ...relationState, context: '3:4' }]]);
	});
});
