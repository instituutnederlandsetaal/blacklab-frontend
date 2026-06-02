// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import { filterTextController, FormSystem, type FormRuntimeContext, type FormSystemDefinition, type PersistableSubmittableFormState } from '@/features/form';

import { TestTextField, createTestBuilder, createTestContext, parentFormProbeView, testTextController } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import ContainerRendererFilters from '@/features/form/ui/ContainerRendererFilters.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';

type FormFixture = {
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
};

function createSingleFormFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });

	form
		.addField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		})
		.addView('search.simple.probe', parentFormProbeView, {});

	return {
		context: createTestContext(),
		definition: builder.build(),
	};
}

function createSharedFieldTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	const root = builder.newContainer('search', ContainerRenderer, { title: 'Search', variant: 'tabs' });
	const sharedField = builder.newField('shared.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Shared word',
	});
	const firstForm = root.addForm('search.first', ContainerRenderer, { title: 'First' });
	const secondForm = root.addForm('search.second', ContainerRenderer, { title: 'Second' });

	firstForm.addChildren(sharedField);
	secondForm.addChildren(sharedField, builder.newView('search.second.probe', parentFormProbeView, {}));

	return {
		context: createTestContext(),
		definition: builder.build(),
	};
}

function createTabbedFormFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.tabbed', ContainerRenderer, { title: 'Tabbed search', variant: 'tabs' });
	const wordTab = form.addContainer('search.tabbed.word', ContainerRenderer, { title: 'Word', combine: 'allOf' });
	const lemmaTab = form.addContainer('search.tabbed.lemma', ContainerRenderer, { title: 'Lemma', combine: 'allOf' });

	wordTab.addField('search.tabbed.word.field', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	lemmaTab
		.addField('search.tabbed.lemma.field', testTextController, TestTextField, {
			annotationId: 'lemma',
			displayName: 'Lemma',
		})
		.addView('search.tabbed.lemma.probe', parentFormProbeView, {});
	return {
		context: createTestContext(),
		definition: builder.build(),
	};
}

function createFilterTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
	const wrapper = form.addContainer('shared.filters.wrapper', ContainerRenderer, {});
	const tabs = builder.newContainer('shared.filters', ContainerRendererFilters, { variant: 'tabs' });
	const tab = tabs.addContainer('shared.filters.bibliographic', ContainerRenderer, { title: 'Bibliographic' });
	const fields = tab.addContainer('shared.filters.bibliographic.fields', ContainerRenderer, {});

	fields.addField('shared.filters.bibliographic.author', filterTextController, TextField, {
		displayName: 'Author',
		groupId: 'bibliographic',
		metadataFieldId: 'author',
	});
	wrapper.addView('shared.filters.heading', HeadingView, { title: 'Filter Search By...' }).addChildren(tabs);

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

		await wrapper.findAll('.nav-tabs a')[1].trigger('click');
		await nextTick();

		expect((wrapper.get('input[aria-label="Shared word"]').element as HTMLInputElement).value).toBe('water');
		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.second');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Shared word:water');
	});

	test('forms can render direct child containers as tabs without an extra wrapper container', async () => {
		const fixture = createTabbedFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.find('input[aria-label="Word"]').exists()).toBe(true);
		expect(wrapper.find('input[aria-label="Lemma"]').exists()).toBe(false);

		await wrapper.findAll('.nav-tabs a')[1].trigger('click');
		await nextTick();

		expect(wrapper.find('input[aria-label="Word"]').exists()).toBe(false);
		expect(wrapper.find('input[aria-label="Lemma"]').exists()).toBe(true);

		await wrapper.get('input[aria-label="Lemma"]').setValue('water');
		await nextTick();

		expect(wrapper.get('[data-testid="parent-form-probe"] .form-id').text()).toBe('search.tabbed');
		expect(wrapper.get('[data-testid="parent-form-probe"] .summaries').text()).toBe('Lemma:water');
	});

	test('filter tabs count active summaries through layout wrappers', async () => {
		const fixture = createFilterTabsFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(wrapper.find('.nav-tabs .badge').exists()).toBe(false);

		await wrapper.get('input[type="text"]').setValue('Austen');
		await nextTick();

		expect(wrapper.get('.nav-tabs .badge').text()).toBe('1');
	});
});
