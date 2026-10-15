// @vitest-environment jsdom

import { createMockCorpusContext } from '@test/mocks/corpus';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import type { Corpus, NormalizedAnnotation, Tagset } from '@/types/apptypes';

import PartOfSpeech from '@/pages/search/form/PartOfSpeech.vue';

const annotation = (id: string, displayName: string, uiType: NormalizedAnnotation['uiType'] = 'select'): NormalizedAnnotation => ({
	annotatedFieldId: 'contents',
	caseSensitive: false,
	defaultDescription: '',
	defaultDisplayName: displayName,
	hasForwardIndex: true,
	id,
	isInternal: false,
	isMainAnnotation: id === 'pos',
	offsetsAlternative: '',
	uiType,
});

const pos = annotation('pos', 'Part of speech', 'pos');
const number = annotation('number', 'Number');
const tagset: Tagset = {
	values: {
		noun: { value: 'N', displayName: 'Noun', subAnnotationIds: ['number'] },
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

afterEach(() => TagsetStore.init({ tagset: undefined } as CorpusContext));

describe('part-of-speech modal', () => {
	test('selects, unselects, resets, and submits visible subannotation values', async () => {
		const corpusContext = createMockCorpusContext({ corpus: { allAnnotationsMap: { number } } as unknown as Corpus });
		TagsetStore.init({ tagset } as CorpusContext);
		const wrapper = mount(PartOfSpeech, { props: { annotation: pos }, global: { plugins: [corpusContext] } });

		await wrapper.findAll('.list-group.main button')[0].trigger('click');
		expect(wrapper.findAll('.category-value').map(value => value.text())).toEqual(['Singular', 'Plural']);
		expect(wrapper.text()).not.toContain('Verb only');
		expect(wrapper.vm.query).toBe('pos="N"');

		const checkboxes = wrapper.findAll<HTMLInputElement>('input[type="checkbox"]');
		await checkboxes[0].setValue(true);
		await checkboxes[1].setValue(true);
		expect(wrapper.vm.query).toBe('pos="N"&number="sg|pl"');
		await checkboxes[0].setValue(false);
		expect(wrapper.vm.query).toBe('pos="N"&number="pl"');

		await wrapper.setProps({ open: false });
		expect(wrapper.find('.modal').exists()).toBe(false);
		await wrapper.setProps({ open: true });
		expect(wrapper.vm.query).toBe('pos="N"&number="pl"');

		await wrapper.get('.modal-footer .btn-default').trigger('click');
		expect(wrapper.vm.query).toBe('');
		await wrapper.findAll('.list-group.main button')[0].trigger('click');
		expect(wrapper.findAll<HTMLInputElement>('input[type="checkbox"]').every(input => !input.element.checked)).toBe(true);
		await wrapper.find('input[type="checkbox"]').setValue(true);
		await wrapper.get('.modal-footer .btn-primary').trigger('click');
		expect(wrapper.emitted('submit')).toEqual([['pos="N"&number="sg"']]);
		expect(wrapper.emitted('close')).toHaveLength(1);
	});
});
