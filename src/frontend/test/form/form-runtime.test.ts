// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { computed, defineComponent, h, nextTick, ref, watchEffect, type PropType } from 'vue';

import {
	ControllerRegistry,
	FormBuilder,
	FormSystem,
	createFormSystemRuntime,
	useParentForm,
	type FieldController,
	type FieldControllerConfig,
	type FormFieldNode,
	type FormRuntimeContext,
	type FormViewNode,
	type ViewDefinition,
} from '@/features/form';
import { artifactFromPattern, tokenPattern, withSummary } from '@/features/form/model/compile/query-artifact';
import { createAndProvideParentForm, createParentFormRuntime, provideFormSystemRuntime } from '@/features/form/model/runtime';

type TextFieldState = {
	value: string;
};

type TextFieldConfig = FieldControllerConfig & {
	annotationId: string;
	label: string;
};

type ParentFormMetrics = {
	compiledEvaluations: number;
	summariesEvaluations: number;
};

const TextField = defineComponent({
	props: {
		node: {
			type: Object as PropType<FormFieldNode<TextFieldConfig>>,
			required: true,
		},
		state: {
			type: Object as PropType<TextFieldState>,
			required: true,
		},
	},
	emits: {
		'update:state': (_state: TextFieldState) => true,
	},
	setup(props, { emit }) {
		return () =>
			h('input', {
				'aria-label': props.node.config.label,
				value: props.state.value,
				onInput(event: Event) {
					emit('update:state', {
						...props.state,
						value: (event.target as HTMLInputElement).value,
					});
				},
			});
	},
});

const textController: FieldController<'test-text', TextFieldState, TextFieldConfig> = {
	kind: 'test-text',
	component: TextField,
	createDefaultState: () => ({ value: '' }),
	buildQuery({ node, state }) {
		const pattern = tokenPattern([
			{
				type: 'equals',
				annotationId: node.config.annotationId,
				value: state.value,
			},
		]);

		return withSummary(artifactFromPattern(pattern), state.value ? { id: node.id, label: node.config.label, value: state.value } : null);
	},
	toJSON() {
		return { kind: this.kind, version: 1 };
	},
};

function createMetricsView(metrics: ParentFormMetrics) {
	return defineComponent({
		props: {
			node: {
				type: Object as PropType<FormViewNode<Record<string, never>>>,
				required: true,
			},
		},
		setup() {
			const parentForm = useParentForm();
			const compiled = computed(() => {
				metrics.compiledEvaluations += 1;
				return parentForm.compiled.cql ?? '';
			});
			const summaries = computed(() => {
				metrics.summariesEvaluations += 1;
				return parentForm.summaries.map(summary => `${summary.label}:${summary.value}`).join('|');
			});

			watchEffect(() => {
				void compiled.value;
				void summaries.value;
			});

			return () => h('div', { 'data-testid': 'metrics-probe', 'data-compiled': compiled.value, 'data-summaries': summaries.value });
		},
	});
}

function createFixture(metrics: ParentFormMetrics) {
	const registry: ControllerRegistry = new ControllerRegistry();
	registry.registerController(textController);

	const metricsView: ViewDefinition<'metrics-probe', Record<string, never>> = {
		kind: 'metrics-probe',
		component: createMetricsView(metrics),
	};
	registry.registerView(metricsView);

	const builder = new FormBuilder(registry);
	const form = builder.newForm('search.form', { title: 'Search' });
	const tabs = builder.newContainer('search.tabs', { title: 'Modes', config: { variant: 'tabs' } });
	const first = builder.newContainer('search.tabs.first', { title: 'First' });
	const second = builder.newContainer('search.tabs.second', { title: 'Second' });

	first.addChildren(
		builder.newField('search.word', textController, {
			annotationId: 'word',
			label: 'Word',
		}),
	);
	second.addChildren(
		builder.newField('search.lemma', textController, {
			annotationId: 'lemma',
			label: 'Lemma',
		}),
	);
	tabs.addChildren(first, second);
	form.addChildren(tabs, builder.newView('search.metrics', metricsView, {}));

	const context: FormRuntimeContext = {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
	};

	return {
		context,
		definition: {
			root: form,
			schemaVersion: 'test',
		},
	};
}

const switchingExpectations = {
	first: {
		cql: '[word="(?i)water"]',
		fieldId: 'search.word-form.word',
		formId: 'search.word-form',
		summaries: [{ id: 'search.word-form.word', label: 'Word', value: 'water' }],
		summaryText: 'Word:water',
	},
	second: {
		cql: '[lemma="(?i)lopen"]',
		fieldId: 'search.lemma-form.lemma',
		formId: 'search.lemma-form',
		summaries: [{ id: 'search.lemma-form.lemma', label: 'Lemma', value: 'lopen' }],
		summaryText: 'Lemma:lopen',
	},
} as const;

function createSwitchingRuntimeFixture() {
	const registry: ControllerRegistry = new ControllerRegistry();
	registry.registerController(textController);

	const builder = new FormBuilder(registry);
	const root = builder.newContainer('search', { title: 'Search', config: { variant: 'tabs' } });
	const firstForm = builder.newForm(switchingExpectations.first.formId, { title: 'Word' });
	const secondForm = builder.newForm(switchingExpectations.second.formId, { title: 'Lemma' });

	firstForm.addChildren(
		builder.newField(switchingExpectations.first.fieldId, textController, {
			annotationId: 'word',
			label: 'Word',
		}),
	);
	secondForm.addChildren(
		builder.newField(switchingExpectations.second.fieldId, textController, {
			annotationId: 'lemma',
			label: 'Lemma',
		}),
	);
	root.addChildren(firstForm, secondForm);

	const context: FormRuntimeContext = {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
	};
	const runtime = createFormSystemRuntime(builder.build(), context);

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
				h('span', { class: 'cql' }, parentForm.compiled.cql ?? ''),
				h('span', { class: 'summaries' }, parentForm.summaries.map(summary => `${summary.label}:${summary.value}`).join('|')),
			]);
	},
});

describe('parent form runtime', () => {
	test('does not recompute compiled and summary projections when only active tab ui state changes', async () => {
		const metrics: ParentFormMetrics = {
			compiledEvaluations: 0,
			summariesEvaluations: 0,
		};
		const fixture = createFixture(metrics);
		const wrapper = mount(FormSystem, {
			props: fixture,
		});

		expect(metrics.compiledEvaluations).toBe(1);
		expect(metrics.summariesEvaluations).toBe(1);

		await wrapper.findAll('nav button')[1].trigger('click');
		await nextTick();

		expect(metrics.compiledEvaluations).toBe(1);
		expect(metrics.summariesEvaluations).toBe(1);
	});

	test('createParentFormRuntime switches projections when a ref formId changes', async () => {
		const fixture = createSwitchingRuntimeFixture();
		const activeFormId = ref<string>(switchingExpectations.first.formId);
		const parentFormRuntime = createParentFormRuntime(fixture.runtime, activeFormId);

		expect(parentFormRuntime.formId.value).toBe(switchingExpectations.first.formId);
		expect(parentFormRuntime.compiled.value.cql).toBe(switchingExpectations.first.cql);
		expect(parentFormRuntime.summaries.value).toEqual(switchingExpectations.first.summaries);
		expect(parentFormRuntime.formState.value.controllerState).toEqual({
			[switchingExpectations.first.fieldId]: { value: 'water' },
		});

		activeFormId.value = switchingExpectations.second.formId;
		await nextTick();

		expect(parentFormRuntime.formId.value).toBe(switchingExpectations.second.formId);
		expect(parentFormRuntime.compiled.value.cql).toBe(switchingExpectations.second.cql);
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
		expect(providedParentForm.compiled.cql).toBe(switchingExpectations.first.cql);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .form-id').text()).toBe(switchingExpectations.first.formId);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .cql').text()).toBe(switchingExpectations.first.cql);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .summaries').text()).toBe(switchingExpectations.first.summaryText);

		activeFormId.value = switchingExpectations.second.formId;
		await nextTick();

		expect(providedParentForm.formId).toBe(switchingExpectations.second.formId);
		expect(providedParentForm.compiled.cql).toBe(switchingExpectations.second.cql);
		expect(providedParentForm.summaries).toEqual(switchingExpectations.second.summaries);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .form-id').text()).toBe(switchingExpectations.second.formId);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .cql').text()).toBe(switchingExpectations.second.cql);
		expect(wrapper.get('[data-testid="injected-parent-form-probe"] .summaries').text()).toBe(switchingExpectations.second.summaryText);
	});
});
