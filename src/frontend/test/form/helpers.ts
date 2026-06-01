import { defineComponent, h, type PropType } from 'vue';

import {
    ControllerRegistry,
    FormBuilder,
    registerBuiltinControllers,
    registerBuiltinViews,
    useParentForm,
    type FormRuntimeContext,
    type ViewDefinition,
} from '@/features/form';
import { artifactFromPattern, tokenPattern, withSummary } from '@/features/form/model/compile/query-artifact';
import { createFieldController } from '@/features/form/model/types/form-controllers';

export type TestTextFieldState = {
	value: string;
};

export type TestTextFieldConfig = {
	annotationId: string;
	displayName: string;
};

export const TestTextField = defineComponent({
	props: {
		config: {
			type: Object as PropType<TestTextFieldConfig>,
			required: true,
		},
		htmlId: {
			type: String,
			required: true,
		},
		modelValue: {
			type: Object as PropType<TestTextFieldState>,
			required: true,
		},
	},
	emits: {
		'update:modelValue': (_value: TestTextFieldState) => true,
	},
	setup(props, { emit }) {
		return () =>
			h('input', {
				id: `${props.htmlId}_value`,
				'aria-label': props.config.displayName,
				value: props.modelValue.value,
				onInput(event: Event) {
					emit('update:modelValue', {
						value: (event.target as HTMLInputElement).value,
					});
				},
			});
	},
});

export const testTextController = createFieldController<'test-text', TestTextFieldState, TestTextFieldConfig>({
	kind: 'test-text',
	createDefaultState: () => ({ value: '' }),
	getQueryContribution({ node, state }) {
		const pattern = tokenPattern([
			{
				type: 'equals',
				annotationId: node.config.annotationId,
				value: state.value,
			},
		]);

		return withSummary(
			artifactFromPattern(pattern),
			state.value
				? {
						id: node.id,
						label: node.config.displayName,
						value: state.value,
					}
				: null,
		);
	},
});

const ParentFormProbe = defineComponent({
	props: {
		config: {
			type: Object as PropType<Record<string, never>>,
			required: true,
		},
	},
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

export const parentFormProbeView: ViewDefinition<'parent-probe', Record<string, never>> = {
	kind: 'parent-probe',
	component: ParentFormProbe,
};

export function createTestContext(): FormRuntimeContext {
	return {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
	};
}

export function createTestRegistry(...views: ViewDefinition<string, any>[]) {
	const registry = new ControllerRegistry();
	registry.registerController(testTextController, TestTextField);
	for (const view of views) {
		registry.registerView(view);
	}
	return registry;
}

export function createTestBuilder(...views: ViewDefinition<string, any>[]) {
	return new FormBuilder(createTestRegistry(...views));
}

export function createBuiltinRegistry() {
	const registry = new ControllerRegistry();
	registerBuiltinControllers(registry);
	registerBuiltinViews(registry);
	return registry;
}