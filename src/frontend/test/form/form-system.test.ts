// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent, h, nextTick, type PropType } from 'vue';

import {
	ControllerRegistry,
	FormBuilder,
	FormSystem,
	useParentForm,
	type FieldController,
	type FieldControllerConfig,
	type FormFieldNode,
	type FormRuntimeContext,
	type FormSystemDefinition,
	type FormViewNode,
	type PersistableSubmittableFormState,
	type ViewDefinition,
} from '@/features/form';
import { artifactFromPattern, tokenPattern, withSummary } from '@/features/form/model/compile/query-artifact';

type TextFieldState = {
	value: string;
};

type TextFieldConfig = FieldControllerConfig & {
	annotationId: string;
	label: string;
};

type FormFixture = {
	context: FormRuntimeContext;
	definition: FormSystemDefinition;
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

/** Helper component that renders out some of the parentForm state, so we can inspect what's really going on from within a test. */
const ParentFormProbe = defineComponent({
	props: { node: { type: Object as PropType<FormViewNode<Record<string, never>>>, required: true } },
	setup() {
		const parentForm = useParentForm();

		return () =>
			h('section', { 'data-testid': 'parent-form-probe' }, [
				h('span', { class: 'form-id' }, parentForm.formId),
				h('span', { class: 'cql' }, parentForm.compiled.cql ?? ''),
				h('span', { class: 'summaries' }, parentForm.summaries.map(summary => `${summary.label}:${summary.value}`).join('|')),
				h('span', { class: 'state' }, JSON.stringify(parentForm.formState.controllerState)),
			]);
	},
});

const parentProbeView: ViewDefinition<'parent-probe', Record<string, never>> = {
	kind: 'parent-probe',
	component: ParentFormProbe,
};

function createRegistry() {
	const registry: ControllerRegistry = new ControllerRegistry();
	registry.registerController(textController);
	registry.registerView(parentProbeView);
	return registry;
}

function createSingleFormFixture(): FormFixture {
	const registry = createRegistry();
	const builder = new FormBuilder(registry);
	const form = builder.newForm('search.simple', { title: 'Simple' });

	form.addChildren(
		builder.newField('search.simple.word', textController, {
			annotationId: 'word',
			label: 'Word',
		}),
		builder.newView('search.simple.probe', parentProbeView, {}),
	);

	return {
		context: {
			corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		},
		definition: builder.build(),
	};
}

function createSharedFieldTabsFixture(): FormFixture {
	const registry = createRegistry();
	const builder = new FormBuilder(registry);
	const root = builder.newContainer('search', { title: 'Search', config: { variant: 'tabs' } });
	const sharedField = builder.newField('shared.word', textController, {
		annotationId: 'word',
		label: 'Shared word',
	});
	const firstForm = builder.newForm('search.first', { title: 'First' });
	const secondForm = builder.newForm('search.second', { title: 'Second' });

	firstForm.addChildren(sharedField);
	secondForm.addChildren(sharedField, builder.newView('search.second.probe', parentProbeView, {}));
	root.addChildren(firstForm, secondForm);

	return {
		context: {
			corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		},
		definition: builder.build(),
	};
}

describe('form system integration', () => {
	test('useParentForm exposes live parent form data from a mounted form tree', async () => {
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

	test('editing the form after submit does not affect the snapshot returned by submit', async () => {
		const fixture = createSingleFormFixture();
		const submitted: Array<[string, PersistableSubmittableFormState]> = [];
		const wrapper = mount(FormSystem, {
			props: {
				...fixture,
				onSubmit: (formId: string, snapshot: PersistableSubmittableFormState) => submitted.push([formId, snapshot]),
			},
		});

		await wrapper.get('input[aria-label="Word"]').setValue('water');
		await wrapper.get('form').trigger('submit');

		expect(submitted).toHaveLength(1);
		expect(submitted[0][0]).toBe('search.simple');
		expect(submitted[0][1].cql).toBe('[word="(?i)water"]');
		expect(submitted[0][1].summaries).toEqual([{ id: 'search.simple.word', label: 'Word', value: 'water' }]);
		expect(submitted[0][1].state.controllerState['search.simple.word']).toEqual({ value: 'water' });

		await wrapper.get('input[aria-label="Word"]').setValue('fire');

		expect(submitted[0][1].state.controllerState['search.simple.word']).toEqual({ value: 'water' });
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
