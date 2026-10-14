import { createMockTranslate } from '@test/mocks/i18n';
import { defineComponent, h, toValue, type PropType } from 'vue';

import { FormBuilder } from '@/features/form/model/builder/form-shape-builder';
import { object, scalar } from '@/features/form/model/controllers/persistence-codec';
import type { NamedFieldDefinition } from '@/features/form/model/field-component-props';
import { FormRuntime } from '@/features/form/model/form-runtime';
import { useFormSystemRuntime, useParentForm } from '@/features/form/model/runtime';
import { defineFieldController, type FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import { annotation } from '@/features/form/model/types/form-query-ir';

export type TestTextFieldState = {
	value: string;
};

type TestTextFieldExtraProps = {
	annotationId: string;
};
export type TestTextFieldDefinition = NamedFieldDefinition<TestTextFieldState, TestTextFieldExtraProps>;
export type TestTextFieldConfig = TestTextFieldDefinition['nodeProps'];

export const TestTextField = defineComponent({
	props: {
		annotationId: {
			type: String,
			required: true,
		},
		displayName: {
			type: String,
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
		disabled: {
			type: Boolean,
			default: false,
		},
	},
	emits: {
		'update:modelValue': (_value: TestTextFieldState) => true,
	},
	setup(props, { emit }) {
		return () =>
			h('input', {
				id: `${props.htmlId}_value`,
				'aria-label': props.displayName,
				disabled: props.disabled,
				value: props.modelValue.value,
				onInput(event: Event) {
					emit('update:modelValue', {
						value: (event.target as HTMLInputElement).value,
					});
				},
			});
	},
});

export const testTextController = defineFieldController<'test-text', TestTextFieldDefinition>({
	kind: 'test-text',
	createDefaultState: () => ({ value: '' }),
	persistence: {
		key: config => config.annotationId,
		codec: object({ value: scalar().default('').atRoot() }).default({ value: '' }),
	},
	outputs: ['patt'],
	collect(config, _runtime, state, emit) {
		const pattern = annotation(config.annotationId, 'wildcard', state.value);
		if (pattern) emit('patt', pattern);
	},
	summarize(config, _runtime, state, emit) {
		if (state.value) emit({ label: toValue(config.displayName), value: state.value });
	},
});

const ParentFormProbe = defineComponent({
	setup() {
		const parentForm = useParentForm();
		const runtime = useFormSystemRuntime();

		return () =>
			h('section', { 'data-testid': 'parent-form-probe' }, [
				h('span', { class: 'form-id' }, parentForm.value),
				h('span', { class: 'cql' }, runtime.value.compile(parentForm.value).params.patt ?? ''),
				h(
					'span',
					{ class: 'summaries' },
					runtime.value
						.compile(parentForm.value)
						.summaries.map(summary => `${summary.label}:${summary.value}`)
						.join('|'),
				),
				h('span', { class: 'state' }, JSON.stringify(runtime.value.state.state.value)),
			]);
	},
});

export const parentFormProbeView = ParentFormProbe;

export function createTestContext(): FormRuntimeContext {
	return {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};
}

export function createTestBuilder(context = createTestContext()) {
	return new FormBuilder(context);
}

export function createTestRuntime(definition: FormBuilder) {
	return new FormRuntime(definition);
}
