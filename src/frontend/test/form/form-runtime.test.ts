// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import { FormSystem } from '@/features/form';

import { TestTextField, createTestBuilder, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('form builder runtime', () => {
	test('submit returns a snapshot isolated from later state changes', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const field = builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);

		builder.state.state.value[field.id] = { value: 'water' };

		const submitted = builder.submit(form.id);
		builder.state.state.value[field.id] = { value: 'fire' };

		expect(submitted.formId).toBe(form.id);
		expect(submitted.patt).toBe('[word="(?i)water"]');
		expect(submitted.summaries).toEqual([{ id: field.id, label: 'Word', value: 'water', summaryType: ['patt'] }]);
		expect(builder.compile(form.id).patt).toBe('[word="(?i)fire"]');
		expect(submitted.patt).toBe('[word="(?i)water"]');
	});

	test('replaceState atomically replaces runtime state with an isolated clone', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const field = builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);
		const replacement = structuredClone(builder.state.getRawState());
		replacement.state[field.id] = { value: 'water' };

		builder.state.replaceState(replacement);
		replacement.state[field.id] = { value: 'changed later' };

		expect(builder.state.state.value[field.id]).toEqual({ value: 'water' });
		expect(builder.compile(form.id).patt).toBe('[word="(?i)water"]');
	});

	test('switching form tabs updates container ui state', async () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, {
			title: 'Search',
			variant: 'tabs',
		});
		const firstForm = builder.newForm('search.first', ContainerRenderer, { title: 'First' });
		const secondForm = builder.newForm('search.second', ContainerRenderer, { title: 'Second' });
		firstForm.addChildren(
			builder.newField('search.first.word', testTextController, TestTextField, {
				annotationId: 'word',
				displayName: 'Word',
			}),
		);
		secondForm.addChildren(
			builder.newField('search.second.lemma', testTextController, TestTextField, {
				annotationId: 'lemma',
				displayName: 'Lemma',
			}),
		);
		root.addChildren(firstForm, secondForm);

		const wrapper = mount(FormSystem, {
			props: {
				definition: builder,
			},
		});

		expect(builder.state.uiState.value[root.id]).toBe(firstForm.id);

		await wrapper.findAll('[role="tab"]')[1].trigger('click');

		expect(builder.state.uiState.value[root.id]).toBe(secondForm.id);
	});
});
