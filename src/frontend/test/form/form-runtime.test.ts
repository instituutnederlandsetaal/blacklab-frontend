// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick, ref } from 'vue';

import { FormSystem } from '@/features/form';

import { TestTextField, createTestBuilder, createTestRuntime, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('form runtime', () => {
	test('submit returns a snapshot isolated from later state changes', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const field = builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);

		const runtime = createTestRuntime(builder);
		runtime.state.state.value[field.id] = { value: 'water' };

		const submitted = runtime.compile(form.id);
		runtime.state.state.value[field.id] = { value: 'fire' };

		expect(submitted.formId).toBe(form.id);
		expect(submitted.patt).toBe('[word="(?i)water"]');
		expect(submitted.summaries).toEqual([{ label: 'Word', value: 'water', summaryType: ['patt'] }]);
		expect(runtime.compile(form.id).patt).toBe('[word="(?i)fire"]');
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
		const runtime = createTestRuntime(builder);
		const replacement = structuredClone(runtime.state.getRawState());
		replacement.state[field.id] = { value: 'water' };

		runtime.state.replaceState(replacement);
		replacement.state[field.id] = { value: 'changed later' };

		expect(runtime.state.state.value[field.id]).toEqual({ value: 'water' });
		expect(runtime.compile(form.id).patt).toBe('[word="(?i)water"]');
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

		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
			},
		});

		expect(runtime.state.uiState.value[root.id]).toBe(firstForm.id);

		await wrapper.findAll('[role="tab"]')[1].trigger('click');

		expect(runtime.state.uiState.value[root.id]).toBe(secondForm.id);
	});

	test('renders supplied actions alongside a form submit and reset', () => {
		const builder = createTestBuilder();
		builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, {
			props: { runtime },
			slots: {
				actions: '<button type="button" class="legacy-action">History</button>',
			},
		});

		const actions = wrapper.get('.blf-form-actions.btn-toolbar');
		expect(actions.find('[type="submit"]').exists()).toBe(true);
		expect(actions.find('[type="reset"]').exists()).toBe(true);
		expect(actions.get('.legacy-action').attributes('type')).toBe('button');
	});

	test('forwards supplied actions through nested containers to the active form', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('root', ContainerRenderer, { class: 'tabs-primary text-primary', variant: ['tabs', 'panel-tabs'] });
		const section = builder.newContainer('root.search', ContainerRenderer, { title: 'Search', variant: 'list' });
		const forms = builder.newContainer('root.search.forms', ContainerRenderer, { variant: 'tabs' });
		forms.addChildren(builder.newForm('root.search.simple', ContainerRenderer, { title: 'Simple' }));
		section.addChildren(forms);
		root.addChildren(section);

		const wrapper = mount(FormSystem, {
			props: { runtime: createTestRuntime(builder) },
			slots: {
				actions: '<button type="button" class="legacy-action">History</button>',
			},
		});

		expect(wrapper.get('[role="tablist"]').classes()).toEqual(expect.arrayContaining(['tabs-primary', 'text-primary', 'blf-form-surface-tabs']));
		expect(wrapper.get('[role="tabpanel"]').classes()).toEqual(expect.arrayContaining(['blf-form-tab-body', 'blf-form-surface-body']));
		expect(wrapper.get('.blf-form-surface').classes()).not.toContain('panel');
		expect(wrapper.get('form.blf-form').classes()).not.toContain('panel-default');
		expect(wrapper.get('form.blf-form > .blf-form-content').exists()).toBe(true);
		expect(wrapper.get('.blf-form-actions').get('.legacy-action').text()).toBe('History');
	});

	test('lazy display props update without rebuilding the form graph', async () => {
		const displayName = ref('Word');
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		form.addChildren(
			builder.newField('search.simple.word', testTextController, TestTextField, {
				annotationId: 'word',
				displayName: () => displayName.value,
			}),
		);
		const runtime = createTestRuntime(builder);
		const wrapper = mount(FormSystem, { props: { runtime } });

		expect(wrapper.get('input').attributes('aria-label')).toBe('Word');

		displayName.value = 'Woord';
		await nextTick();

		expect(wrapper.get('input').attributes('aria-label')).toBe('Woord');
	});
});
