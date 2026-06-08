// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { computed, defineComponent, h, nextTick, ref, watchEffect } from 'vue';

import { cloneFormState, FormSystem, createFormSystemRuntime, useParentForm } from '@/features/form';
import { createAndProvideParentForm, createParentFormRuntime, provideFormSystemRuntime } from '@/features/form/model/runtime';

import { TestTextField, createTestBuilder, createTestContext, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

type ParentFormMetrics = {
	compiledEvaluations: number;
	summariesEvaluations: number;
};

function createMetricsView(metrics: ParentFormMetrics) {
	return defineComponent({
		setup() {
			const parentForm = useParentForm();
			const compiled = computed(() => {
				metrics.compiledEvaluations += 1;
				return parentForm.compiled.patt ?? '';
			});
			const summaries = computed(() => {
				metrics.summariesEvaluations += 1;
				return parentForm.summaries.map(summary => `${summary.label}:${summary.value}`).join('|');
			});

			watchEffect(() => {
				void compiled.value;
				void summaries.value;
			});

			return () =>
				h('div', {
					'data-testid': 'metrics-probe',
					'data-compiled': compiled.value,
					'data-summaries': summaries.value,
				});
		},
	});
}

function createProjectionMetricsFixture(metrics: ParentFormMetrics) {
	const metricsView = createMetricsView(metrics);
	const builder = createTestBuilder();
	const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });
	const tabs = form.addContainer('search.tabs', ContainerRenderer, {
		title: 'Modes',
		variant: 'tabs',
	});
	const first = tabs.addContainer('search.tabs.first', ContainerRenderer, { title: 'First' });
	const second = tabs.addContainer('search.tabs.second', ContainerRenderer, { title: 'Second' });

	first.addField('search.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	second.addField('search.lemma', testTextController, TestTextField, {
		annotationId: 'lemma',
		displayName: 'Lemma',
	});
	form.addView('search.metrics', metricsView, {});

	return {
		context: createTestContext(),
		definition: {
			root: form,
		},
	};
}

const switchingExpectations = {
	first: {
		patt: '[word="(?i)water"]',
		fieldId: 'search.word-form.word',
		formId: 'search.word-form',
		summaries: [{ id: 'search.word-form.word', label: 'Word', value: 'water' }],
		summaryText: 'Word:water',
	},
	second: {
		patt: '[lemma="(?i)lopen"]',
		fieldId: 'search.lemma-form.lemma',
		formId: 'search.lemma-form',
		summaries: [{ id: 'search.lemma-form.lemma', label: 'Lemma', value: 'lopen' }],
		summaryText: 'Lemma:lopen',
	},
} as const;

function createSwitchingRuntimeFixture() {
	const builder = createTestBuilder();
	const root = builder.newContainer('search', ContainerRenderer, {
		title: 'Search',
		variant: 'tabs',
	});
	const firstForm = root.addForm(switchingExpectations.first.formId, ContainerRenderer, {
		title: 'Word',
	});
	const secondForm = root.addForm(switchingExpectations.second.formId, ContainerRenderer, {
		title: 'Lemma',
	});

	firstForm.addField(switchingExpectations.first.fieldId, testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	secondForm.addField(switchingExpectations.second.fieldId, testTextController, TestTextField, {
		annotationId: 'lemma',
		displayName: 'Lemma',
	});
	const runtime = createFormSystemRuntime(builder.build(), createTestContext());

	runtime.state.value.controllerState[switchingExpectations.first.fieldId] = { value: 'water' };
	runtime.state.value.controllerState[switchingExpectations.second.fieldId] = { value: 'lopen' };

	return {
		runtime,
	};
}

const InjectedParentFormProbe = defineComponent({
	setup() {
		const parentForm = useParentForm();

		return () =>
			h('section', { 'data-testid': 'injected-parent-form-probe' }, [
				h('span', { class: 'form-id' }, parentForm.formId),
				h('span', { class: 'cql' }, parentForm.compiled.patt ?? ''),
				h('span', { class: 'summaries' }, parentForm.summaries.map(summary => `${summary.label}:${summary.value}`).join('|')),
			]);
	},
});

describe('form system runtime', () => {
	test('submit returns a snapshot isolated from later state changes', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const field = builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});

		form.addChildren(field);

		const runtime = createFormSystemRuntime(builder.build(), createTestContext());
		runtime.state.value.controllerState[field.id] = { value: 'water' };

		const submitted = runtime.submit(form.id);
		runtime.state.value.controllerState[field.id] = { value: 'fire' };

		expect(submitted.formId).toBe(form.id);
		expect(submitted.patt).toBe('[word="(?i)water"]');
		expect(submitted.summaries).toEqual([{ id: field.id, label: 'Word', value: 'water' }]);
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
		const runtime = createFormSystemRuntime(builder.build(), createTestContext());
		const parentForm = createParentFormRuntime(runtime, form.id);
		const replacement = cloneFormState(runtime.state.value);
		replacement.controllerState[field.id] = { value: 'water' };

		runtime.replaceState(replacement);
		replacement.controllerState[field.id] = { value: 'changed later' };

		expect(runtime.state.value.controllerState[field.id]).toEqual({ value: 'water' });
		expect(parentForm.formState.value.controllerState[field.id]).toEqual({ value: 'water' });
		expect(runtime.compile(form.id).patt).toBe('[word="(?i)water"]');
	});

	test('switching form tabs updates container ui state', async () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, {
			title: 'Search',
			variant: 'tabs',
		});
		const firstForm = root.addForm('search.first', ContainerRenderer, { title: 'First' });
		const secondForm = root.addForm('search.second', ContainerRenderer, { title: 'Second' });
		firstForm.addField('search.first.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		secondForm.addField('search.second.lemma', testTextController, TestTextField, {
			annotationId: 'lemma',
			displayName: 'Lemma',
		});

		const wrapper = mount(FormSystem, {
			props: {
				context: createTestContext(),
				definition: builder.build(),
			},
		});
		const runtime = wrapper.emitted('ready')?.[0]?.[0] as ReturnType<typeof createFormSystemRuntime>;

		expect(runtime.state.value.uiState.activeContainers[root.id]).toBe(firstForm.id);

		await wrapper.findAll('.nav-tabs a')[1].trigger('click');

		expect(runtime.state.value.uiState.activeContainers[root.id]).toBe(secondForm.id);
	});
});

describe('parent form runtime', () => {
	test('keeps compiled and summary projections stable when only tab ui state changes', async () => {
		const metrics: ParentFormMetrics = {
			compiledEvaluations: 0,
			summariesEvaluations: 0,
		};
		const fixture = createProjectionMetricsFixture(metrics);
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(metrics.compiledEvaluations).toBe(1);
		expect(metrics.summariesEvaluations).toBe(1);

		await wrapper.findAll('.nav-tabs a')[1].trigger('click');
		await nextTick();

		expect(metrics.compiledEvaluations).toBe(1);
		expect(metrics.summariesEvaluations).toBe(1);
	});

	test('createParentFormRuntime switches projections when a ref formId changes', async () => {
		const fixture = createSwitchingRuntimeFixture();
		const activeFormId = ref<string>(switchingExpectations.first.formId);
		const parentFormRuntime = createParentFormRuntime(fixture.runtime, activeFormId);

		expect(parentFormRuntime.formId.value).toBe(switchingExpectations.first.formId);
		expect(parentFormRuntime.compiled.value.patt).toBe(switchingExpectations.first.patt);
		expect(parentFormRuntime.summaries.value).toEqual(switchingExpectations.first.summaries);
		expect(parentFormRuntime.formState.value.controllerState).toEqual({
			[switchingExpectations.first.fieldId]: { value: 'water' },
		});

		activeFormId.value = switchingExpectations.second.formId;
		await nextTick();

		expect(parentFormRuntime.formId.value).toBe(switchingExpectations.second.formId);
		expect(parentFormRuntime.compiled.value.patt).toBe(switchingExpectations.second.patt);
		expect(parentFormRuntime.summaries.value).toEqual(switchingExpectations.second.summaries);
		expect(parentFormRuntime.formState.value.controllerState).toEqual({
			[switchingExpectations.second.fieldId]: { value: 'lopen' },
		});
	});

	test('createAndProvideParentForm and useParentForm track getter formId changes', async () => {
		const fixture = createSwitchingRuntimeFixture();
		const activeFormId = ref<string>(switchingExpectations.first.formId);
		let providedParentForm!: ReturnType<typeof createAndProvideParentForm>;

		const ProviderHarness = defineComponent({
			setup() {
				provideFormSystemRuntime(fixture.runtime);
				providedParentForm = createAndProvideParentForm(fixture.runtime, () => activeFormId.value);

				return () => h(InjectedParentFormProbe);
			},
		});

		const wrapper = mount(ProviderHarness);

		expect(providedParentForm.formId).toBe(switchingExpectations.first.formId);
		expect(providedParentForm.compiled.patt).toBe(switchingExpectations.first.patt);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .form-id').text()).toBe(switchingExpectations.first.formId);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .cql').text()).toBe(switchingExpectations.first.patt);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .summaries').text()).toBe(switchingExpectations.first.summaryText);

		activeFormId.value = switchingExpectations.second.formId;
		await nextTick();

		expect(providedParentForm.formId).toBe(switchingExpectations.second.formId);
		expect(providedParentForm.compiled.patt).toBe(switchingExpectations.second.patt);
		expect(providedParentForm.summaries).toEqual(switchingExpectations.second.summaries);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .form-id').text()).toBe(switchingExpectations.second.formId);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .cql').text()).toBe(switchingExpectations.second.patt);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .summaries').text()).toBe(switchingExpectations.second.summaryText);
	});
});
