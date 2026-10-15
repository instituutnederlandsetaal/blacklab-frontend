// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils';
import { expect, test } from 'vitest';

import { createDefaultCqlQueryBuilderData, type CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';

import CqlQueryBuilder from '@/features/cql-query-builder/CqlQueryBuilder.vue';
import QueryBuilderField from '@/features/form/fields/QueryBuilderField.vue';

const options: CqlQueryBuilderOptions = {
	indexId: 'test',
	defaultAnnotationId: 'word',
	textDirection: 'ltr',
	allAnnotationsMap: {},
	autocomplete: async () => [],
	annotationOptions: [],
};

test('adding a token emits an updated query without mutating the supplied value', async () => {
	const modelValue = createDefaultCqlQueryBuilderData('word');
	const wrapper = mount(CqlQueryBuilder, { props: { modelValue, options } });

	await wrapper.get('.bl-token-create').trigger('click');
	await flushPromises();
	const edited = wrapper.emitted('update:modelValue')?.at(-1)?.[0];
	expect(edited).toMatchObject({ tokens: [expect.any(Object), expect.any(Object)] });
	expect(modelValue.tokens).toHaveLength(1);
});

test('the form field forwards query-builder values and edits', () => {
	const modelValue = createDefaultCqlQueryBuilderData('word');
	const wrapper = mount(QueryBuilderField, { props: { id: 'query', htmlId: 'query', modelValue, options }, global: { stubs: { CqlQueryBuilder: true } } });
	const builder = wrapper.getComponent(CqlQueryBuilder);
	expect(builder.props()).toMatchObject({ modelValue, options });
	const edited = { tokens: [...modelValue.tokens, ...createDefaultCqlQueryBuilderData('word').tokens] };
	builder.vm.$emit('update:modelValue', edited);
	expect(wrapper.emitted('update:modelValue')).toEqual([[edited]]);
});
