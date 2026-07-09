// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';

import { annotationTextController, filterTextController, FormSystem, type CompiledFormStateWithSummaries, type FormBuilder } from '@/features/form';

import { TestTextField, createTestBuilder, parentFormProbeView, testTextController } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import ContainerRendererFilters from '@/features/form/ui/ContainerRendererFilters.vue';
import HeadingView from '@/features/form/views/HeadingView.vue';
import SummaryView from '@/features/form/views/SummaryView.vue';

type FormFixture = {
	definition: FormBuilder;
};

function createSingleFormFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });

	form.addChildren(
		builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		}),
		builder.newView('search.simple.probe', parentFormProbeView, {}),
	);

	return {
		definition: builder,
	};
}

function createAutocompleteTextFixture(): FormFixture {
	const builder = createTestBuilder();
	const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });

	form.addChildren(
		builder.newField('search.simple.annotation', annotationTextController, TextField, {
			annotationId: 'word',
			autocomplete: vi.fn(async () => []),
			displayName: 'Word',
		}),
	);

	return {
		definition: builder,
	};
}

function createSiblingFormsFixture(): FormFixture {
	const builder = createTestBuilder();
	builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(
		builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Simple word',
		}),
	);
	builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(
		builder.newField('search.extended.lemma', testTextController, TestTextField, {
			annotationId: 'lemma',
			displayName: 'Extended lemma',
		}),
	);

	return {
		definition: builder,
	};
}

function createSharedFieldTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	const root = builder.newContainer('search', ContainerRenderer, {
		title: 'Search',
		variant: 'tabs',
	});
	const sharedField = builder.newField('shared.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Shared word',
	});
	root.addChildren(
		builder.newForm('search.first', ContainerRenderer, { title: 'First' }).addChildren(sharedField),
		builder.newForm('search.second', ContainerRenderer, { title: 'Second' }).addChildren(sharedField, builder.newView('search.second.probe', parentFormProbeView, {})),
	);

	return {
		definition: builder,
	};
}

function createTabbedFormFixture(): FormFixture {
	const builder = createTestBuilder();
	builder
		.newForm('search.tabbed', ContainerRenderer, {
			title: 'Tabbed search',
			variant: 'tabs',
		})
		.addChildren(
			builder.newContainer('search.tabbed.word', ContainerRenderer, { title: 'Word', combine: 'and' }).addChildren(
				builder.newField('search.tabbed.word.field', testTextController, TestTextField, {
					annotationId: 'word',
					displayName: 'Word',
				}),
			),
			builder.newContainer('search.tabbed.lemma', ContainerRenderer, { title: 'Lemma', combine: 'and' }).addChildren(
				builder.newField('search.tabbed.lemma.field', testTextController, TestTextField, {
					annotationId: 'lemma',
					displayName: 'Lemma',
				}),
				builder.newView('search.tabbed.lemma.probe', parentFormProbeView, {}),
			),
		);
	return {
		definition: builder,
	};
}

function createFilterTabsFixture(): FormFixture {
	const builder = createTestBuilder();
	builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(
		builder.newContainer('shared.filters.wrapper', ContainerRenderer, {}).addChildren(
			builder.newView('shared.filters.heading', HeadingView, { title: 'Filter Search By...' }),
			builder.newContainer('shared.filters', ContainerRendererFilters, { variant: 'tabs' }).addChildren(
				builder.newContainer('shared.filters.bibliographic', ContainerRenderer, { title: 'Bibliographic' }).addChildren(
					builder.newContainer('shared.filters.bibliographic.fields', ContainerRenderer, {}).addChildren(
						builder.newField('shared.filters.bibliographic.author', filterTextController, TextField, {
							displayName: 'Author',
							groupId: 'bibliographic',
							metadataFieldId: 'author',
						}),
					),
				),
			),
			builder.newView('shared.filters.summary', SummaryView, { title: 'Filter summary' }),
		),
	);

	return {
		definition: builder,
	};
}

describe('form system integration', () => {
	test('can render a selected root form from a shared definition', () => {
		const fixture = createSiblingFormsFixture();
		const wrapper = mount(FormSystem, {
			props: {
				...fixture,
				rootId: 'search.extended',
			},
		});

		expect(wrapper.find('input[aria-label="Simple word"]').exists()).toBe(false);
		expect(wrapper.find('input[aria-label="Extended lemma"]').exists()).toBe(true);
	});

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

		const emitted = wrapper.emitted('submit') as Array<[string, CompiledFormStateWithSummaries]> | undefined;
		expect(emitted).toHaveLength(1);
		const [formId, snapshot] = emitted![0];

		expect(formId).toBe('search.simple');
		expect(snapshot.patt).toBe('[word="(?i)water"]');
		expect(snapshot.summaries).toEqual([{ id: 'search.simple.word', label: 'Word', value: 'water' }]);

		await wrapper.get('input[aria-label="Word"]').setValue('fire');

		expect(snapshot.patt).toBe('[word="(?i)water"]');
		expect(snapshot.summaries).toEqual([{ id: 'search.simple.word', label: 'Word', value: 'water' }]);
	});

	test('editable autocomplete submits the latest input event without waiting for a tick', async () => {
		const fixture = createAutocompleteTextFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});
		const input = wrapper.get('input[type="text"]').element as HTMLInputElement;

		input.value = 'water';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		await wrapper.get('form').trigger('submit');

		const emitted = wrapper.emitted('submit') as Array<[string, CompiledFormStateWithSummaries]> | undefined;
		expect(emitted).toHaveLength(1);
		const [formId, snapshot] = emitted![0];

		expect(formId).toBe('search.simple');
		expect(snapshot.patt).toBe('[word="(?i)water"]');
		expect(snapshot.encoded).toEqual({
			'f.form': 'search.simple',
			'f.word': 'water',
		});
	});

	test('submit does not bubble to parent form handlers', async () => {
		const fixture = createSingleFormFixture();
		const parentSubmit = vi.fn();
		const Harness = defineComponent({
			setup() {
				return () =>
					h(
						'div',
						{
							onSubmit: parentSubmit,
						},
						h(FormSystem, { definition: fixture.definition }),
					);
			},
		});
		const wrapper = mount(Harness);

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await wrapper.get('form').trigger('submit');

		expect(wrapper.findComponent(FormSystem).emitted('submit')).toHaveLength(1);
		expect(parentSubmit).not.toHaveBeenCalled();
	});

	test('replaceState updates rendered field state after mount', async () => {
		const fixture = createSingleFormFixture();
		const wrapper = mount(FormSystem, {
			props: fixture,
		});
		const runtime = fixture.definition;
		const replacement = structuredClone(runtime.state.getRawState());
		replacement.state['search.simple.word'] = { value: 'water' };

		runtime.state.replaceState(replacement);
		await nextTick();

		expect((wrapper.get('input[aria-label="Word"]').element as HTMLInputElement).value).toBe('water');

		await wrapper.get('input[aria-label="Word"]').setValue('fire');

		expect(runtime.state.state.value['search.simple.word']).toEqual({ value: 'fire' });
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
		expect(wrapper.find('.blf-summary-view .entry').exists()).toBe(false);

		await wrapper.get('input[type="text"]').setValue('Austen');
		await nextTick();

		expect(wrapper.get('.nav-tabs .badge').text()).toBe('1');
		expect(wrapper.get('.blf-summary-view .entry .label').text()).toBe('Author');
		expect(wrapper.get('.blf-summary-view .entry .value').text()).toBe('Austen');
	});
});
