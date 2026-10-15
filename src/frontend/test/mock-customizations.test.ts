// @vitest-environment jsdom

import { createMockCustomizations } from '@test/mocks/customizations';
import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import { defineComponent, h } from 'vue';

import { useCustomizations } from '@/customization-api/internal/internal-api';
import type { Corpus } from '@/types/apptypes';

test('mounted clients keep their customization values and call histories independent', async () => {
	const corpus = { id: 'test' } as Corpus;
	const first = createMockCustomizations(corpus);
	const second = createMockCustomizations(corpus);
	first.resultDetailedMetadataIds.mockReturnValue(['author']);
	second.resultDetailedMetadataIds.mockReturnValue(['title']);
	const Client = defineComponent({
		setup() {
			const customizations = useCustomizations();
			return () => h('button', { onClick: () => customizations.setResultConcordanceAnnotationId('lemma') }, customizations.resultDetailedMetadataIds()?.join(','));
		},
	});
	const firstClient = mount(Client, { global: { plugins: [first] } });
	const secondClient = mount(Client, { global: { plugins: [second] } });
	expect(firstClient.text()).toBe('author');
	expect(secondClient.text()).toBe('title');
	await firstClient.get('button').trigger('click');
	expect(first.setResultConcordanceAnnotationId).toHaveBeenCalledExactlyOnceWith('lemma');
	expect(second.setResultConcordanceAnnotationId).not.toHaveBeenCalled();
});
