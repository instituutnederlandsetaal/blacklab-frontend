// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import { FormSystem, type FormRuntimeContext, type FormSystemDefinition, type PersistableSubmittableFormState } from '@/features/form';

import { createTestBuilder, createTestContext, parentFormProbeView, testTextController } from './helpers';

type FormFixture = {
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
};

function createSingleFormFixture(): FormFixture {
	const builder = createTestBuilder(parentFormProbeView);
	const form = builder.newForm('search.simple', { title: 'Simple' });

	form.addChildren(
		builder.newField('search.simple.word', testTextController, {
			annotationId: 'word',
			displayName: 'Word',
		}),
		builder.newView('search.simple.probe', parentFormProbeView, {}),
	);

	return {
		context: createTestContext(),
		definition: builder.build(),
	};
}

function createSharedFieldTabsFixture(): FormFixture {
	const builder = createTestBuilder(parentFormProbeView);
	const root = builder.newContainer('search', { title: 'Search', config: { variant: 'tabs' } });
	const sharedField = builder.newField('shared.word', testTextController, {
		annotationId: 'word',
		displayName: 'Shared word',
	});
	const firstForm = builder.newForm('search.first', { title: 'First' });
	const secondForm = builder.newForm('search.second', { title: 'Second' });

	firstForm.addChildren(sharedField);
	secondForm.addChildren(sharedField, builder.newView('search.second.probe', parentFormProbeView, {}));
	root.addChildren(firstForm, secondForm);

	return {
		context: createTestContext(),
		definition: builder.build(),
	};
}

describe('form system integration', () => {
	test('mounted views receive live parent-form projections', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.simple');
		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('');

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await nextTick();

		expect(wrapper.get('[data-testid="parent-form-probe"] .cql').text()).toBe('[word="(?i)water"]');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Word:water');
		expect(wrapper.get('[data-testid="parent-form-probe"] .state').text()).toContain('water');
	});

	test('submit emits a snapshot that is isolated from later edits', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await wrapper.get('form').trigger('submit');

		const emitted = wrapper.emitted('submit') as Array<[string, PersistableSubmittableFormState]> | undefined;
		expect(emitted).toHaveLength(1);
		const [formId, snapshot] = emitted![0];

		expect(formId).toBe('search.simple');
		expect(snapshot.cql).toBe('[word="(?i)water"]');
		expect(snapshot.summaries).toEqual([{ id: 'search.simple.word', label: 'Word', value: 'water' }]);
		expect(snapshot.state.controllerState['search.simple.word']).toEqual({ value: 'water' });

		await wrapper.get('input[aria-label="Word"]').setValue('fire');

		expect(snapshot.state.controllerState['search.simple.word']).toEqual({ value: 'water' });
	});

	test('reused field nodes share state across tabbed forms', async () => {
		const fixture = createSharedFieldTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		await wrapper.get('input[aria-label="Shared word"]').setValue('water');

		await wrapper.findAll('nav button')[1].trigger('click');
		await nextTick();

		expect((wrapper.get('input[aria-label="Shared word"]').element as HTMLInputElement).value).toBe('water');
		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.second');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Shared word:water');
	});
});
