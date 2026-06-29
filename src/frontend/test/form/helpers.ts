import { defineComponent, h, type PropType } from 'vue';

import { FormBuilder, useFormSystemRuntime, useParentForm, type FormRuntimeContext } from '@/features/form';
import { queryFragment, token, tokenPredicate } from '@/features/form/model/compile/query-artifact';
import { createFieldController } from '@/features/form/model/types/form-controllers';

import { createMockI18n } from '@test/mocks/i18n';

export type TestTextFieldState = {
	value: string;
};

export type TestTextFieldConfig = {
	annotationId: string;
	displayName: string;
};

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

export const testTextController = createFieldController<'test-text', TestTextFieldState, TestTextFieldConfig>({
	kind: 'test-text',
	createDefaultState: () => ({ value: '' }),
	getPersistKey: config => config.annotationId,
	affectsBlackLabParameters: ['patt'],
	encode(state) {
		return state.value || null;
	},
	restore(payload) {
		return {
			value: Array.isArray(payload) ? (payload[0] ?? '') : payload,
		};
	},
	getQueryContribution(config, _runtime, state) {
		const pattern = token(tokenPredicate('wildcard', config.annotationId, state.value, false));
		return queryFragment(
			pattern,
			state.value
				? {
						id: config.id,
						label: config.displayName,
						value: state.value,
					}
				: null,
		);
	},
});

const ParentFormProbe = defineComponent({
	setup() {
		const parentForm = useParentForm();
		const runtime = useFormSystemRuntime();

		return () =>
			h('section', { 'data-testid': 'parent-form-probe' }, [
				h('span', { class: 'form-id' }, parentForm.value),
				h('span', { class: 'cql' }, runtime.compile(parentForm.value).patt ?? ''),
				h(
					'span',
					{ class: 'summaries' },
					runtime
						.compile(parentForm.value)
						.summaries.map(summary => `${summary.label}:${summary.value}`)
						.join('|'),
				),
				h('span', { class: 'state' }, JSON.stringify(runtime.state.state.value)),
			]);
	},
});

export const parentFormProbeView = ParentFormProbe;

export function createTestContext(): FormRuntimeContext {
	return {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
		translate: createMockI18n().translate,
	};
}

export function createTestBuilder() {
	return new FormBuilder(createTestContext());
}
