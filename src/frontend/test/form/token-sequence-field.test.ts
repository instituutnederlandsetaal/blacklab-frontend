// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { defineComponent, h, nextTick, type PropType } from 'vue';

import { createFormFieldNode, defineFieldController, FormRuntime, FormSystem, object, restoreFieldState, scalar, type NamedFieldDefinition } from '@/features/form';
import { createDefaultTextFieldState, type TextFieldDefinition, type TextFieldState } from '@/features/form/fields/generic/text-field';
import type { TokenSequenceCreateField, TokenSequenceFieldState } from '@/features/form/fields/token-sequence-field';
import { tokenSequenceController } from '@/features/form/model/controllers/token-sequence-controller';
import { annotation, filter } from '@/features/form/model/types/form-query-ir';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';

import { createTestBuilder } from './helpers';

import NumberField from '@/features/form/fields/generic/NumberField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import TokenSequenceField from '@/features/form/fields/TokenSequenceField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';
import FieldRenderer from '@/features/form/ui/FieldRenderer.vue';

type ChildControllerConfig = {
	annotationId: string;
	persistKey: string;
};

const childController = defineFieldController<'token-sequence-test-child', TextFieldDefinition, ChildControllerConfig>({
	kind: 'token-sequence-test-child',
	createDefaultState: createDefaultTextFieldState,
	persistence: {
		key: config => config.persistKey,
		codec: object({
			value: scalar()
				.default('')
				.atRoot()
				.refine(value => {
					if (value === 'invalid') throw new Error('nested child error');
				}),
			caseSensitive: scalar()
				.transform<boolean>({ encode: value => (value ? '1' : '0'), decode: value => value === '1' })
				.default(false)
				.at('c'),
		}).default(createDefaultTextFieldState()),
	},
	outputs: ['patt'],
	collect(config, _runtime, state, emit) {
		if (!state.value) return;
		const pattern = annotation(config.annotationId, 'wildcard', state.value, state.caseSensitive ? { caseSensitive: true } : undefined);
		if (pattern) emit('patt', pattern);
	},
});

type LemmaFieldState = { exact: boolean; lemma: string };
type LemmaFieldDefinition = NamedFieldDefinition<LemmaFieldState, ChildControllerConfig>;

const LemmaField = defineComponent({
	props: {
		disabled: Boolean,
		displayName: { type: String, required: true },
		htmlId: { type: String, required: true },
		modelValue: { type: Object as PropType<LemmaFieldState>, required: true },
	},
	emits: { 'update:modelValue': (_value: LemmaFieldState) => true },
	setup(props, { emit }) {
		return () =>
			h('input', {
				id: `${props.htmlId}_lemma`,
				disabled: props.disabled,
				value: props.modelValue.lemma,
				onInput: (event: Event) => emit('update:modelValue', { ...props.modelValue, lemma: (event.target as HTMLInputElement).value }),
			});
	},
});

const lemmaChildController = defineFieldController<'token-sequence-test-lemma', LemmaFieldDefinition>({
	kind: 'token-sequence-test-lemma',
	createDefaultState: () => ({ exact: true, lemma: '' }),
	persistence: {
		key: config => config.persistKey,
		codec: object({
			lemma: scalar().default('').atRoot(),
			exact: scalar()
				.transform<boolean>({ encode: value => (value ? '1' : '0'), decode: value => value === '1' })
				.default(true)
				.at('e'),
		}).default({ exact: true, lemma: '' }),
	},
	outputs: ['patt'],
	collect(config, _runtime, state, emit) {
		if (!state.lemma) return;
		const pattern = annotation(config.annotationId, state.exact ? 'literal' : 'wildcard', state.lemma);
		if (pattern) emit('patt', pattern);
	},
});

function createFixture(variant: BaseFieldNode['variant'] = 'large', minLength = 1) {
	const builder = createTestBuilder();
	const sequence = builder.newField('explore.ngram.tokens', tokenSequenceController, TokenSequenceField, {
		createField: (({ annotationId, ...binding }) => {
			const config = {
				annotationId,
				displayName: annotationId === 'word' ? 'Word' : 'Lemma',
				persistKey: `${annotationId}-value`,
				showLabel: false,
			};
			return annotationId === 'word' ? createFormFieldNode(binding, childController, TextField, config) : createFormFieldNode(binding, lemmaChildController, LemmaField, config);
		}) satisfies TokenSequenceCreateField,
		selectorOptions: [
			{ value: 'word', label: 'Word' },
			{ value: 'lemma', label: 'Lemma' },
		],
		defaultFieldId: 'word',
		minLength,
		maxLength: 5,
		defaultLength: 2,
		lengthDisplayName: 'N-gram length',
		selectorDisplayName: 'Property',
		selectorPlaceholder: 'Choose a property',
		persistKey: 'ngram-tokens',
		variant,
	});
	builder.newForm('explore.ngram', ContainerRenderer, {}).addChildren(sequence);
	return { builder, runtime: new FormRuntime(builder), sequence };
}

function sequenceState(runtime: FormRuntime): TokenSequenceFieldState {
	return runtime.state.state.value['explore.ngram.tokens'] as TokenSequenceFieldState;
}

const gatheredChildController = defineFieldController<'token-sequence-gathered-child', TextFieldDefinition, ChildControllerConfig>({
	...childController,
	kind: 'token-sequence-gathered-child',
	outputs: ['patt', 'filter'],
	collect(config, _runtime, state, emit) {
		if (state.value === 'throw') throw new Error('embedded child error');
		if (state.value === 'filter') {
			emit('filter', filter('author', 'literal', 'Austen')!);
			return;
		}
		const pattern = annotation(config.annotationId, 'wildcard', state.value);
		if (pattern) emit('patt', pattern);
	},
	summarize(_config, _runtime, state, emit) {
		if (state.value) emit({ label: 'Child', value: state.value });
	},
});

function createGatheredChildrenFixture() {
	const builder = createTestBuilder();
	const sequence = builder.newField('explore.ngram.tokens', tokenSequenceController, TokenSequenceField, {
		createField: (({ annotationId, ...binding }) =>
			createFormFieldNode(binding, gatheredChildController, TextField, {
				annotationId,
				displayName: 'Word',
				persistKey: 'word-value',
			})) satisfies TokenSequenceCreateField,
		selectorOptions: [{ value: 'word', label: 'Word' }],
		defaultFieldId: 'word',
		minLength: 1,
		maxLength: 3,
		defaultLength: 2,
		lengthDisplayName: 'N-gram length',
		selectorDisplayName: 'Property',
		persistKey: 'ngram-tokens',
	});
	builder.newForm('explore.ngram', ContainerRenderer, {}).addChildren(sequence);
	return { runtime: new FormRuntime(builder), sequence };
}

describe('token sequence composite field', () => {
	test('creates the configured number of independent active token defaults', () => {
		const { runtime } = createFixture();
		const state = sequenceState(runtime);
		expect(state).toEqual([
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
		]);
		expect(state[0].fieldState).not.toBe(state[1].fieldState);
		(state[0].fieldState as TextFieldState).value = 'first only';
		expect(state[1].fieldState).toEqual({ value: '', caseSensitive: false });
	});

	test('compiles blank children as ordered any-token patterns', () => {
		const { runtime } = createFixture();
		const state = sequenceState(runtime);
		state[0].fieldState = { value: 'water', caseSensitive: false } satisfies TextFieldState;
		state[1] = { fieldId: 'lemma', fieldState: { exact: true, lemma: '' } satisfies LemmaFieldState };
		expect(runtime.compile('explore.ngram').params.patt).toBe('[word="water"] []');
	});

	test('compiles populated children through their selected controllers', () => {
		const { runtime } = createFixture();
		const state = sequenceState(runtime);
		state[0].fieldState = { value: 'water', caseSensitive: false } satisfies TextFieldState;
		state[1] = { fieldId: 'lemma', fieldState: { exact: false, lemma: 'run*' } satisfies LemmaFieldState };
		expect(runtime.compile('explore.ngram').params.patt).toBe('[word="water"] [lemma="run.*"]');
	});

	test('reports embedded controller errors from the compound controller', () => {
		const { runtime } = createGatheredChildrenFixture();
		const state = sequenceState(runtime);
		state[0].fieldState = { value: 'throw', caseSensitive: false };
		state[1].fieldState = { value: 'water', caseSensitive: false };

		const compiled = runtime.compile('explore.ngram');

		expect(compiled.params).not.toHaveProperty('patt');
		expect(compiled.issues).toContainEqual({ severity: 'error', message: "Controller for 'explore.ngram.tokens' failed: embedded child error" });
		expect(compiled.summaries.filter(summary => summary.label === 'Child').map(summary => summary.value)).toEqual(['throw', 'water']);
	});

	test('fails compound collection when a child emits an unexpected output', () => {
		const { runtime } = createGatheredChildrenFixture();
		const state = sequenceState(runtime);
		state[0].fieldState = { value: 'filter', caseSensitive: false };
		state[1].fieldState = { value: 'water', caseSensitive: false };

		const compiled = runtime.compile('explore.ngram');

		expect(compiled.params).not.toHaveProperty('patt');
		expect(compiled.params).not.toHaveProperty('filter');
		expect(compiled.issues).toContainEqual({
			severity: 'error',
			message: "Controller for 'explore.ngram.tokens' failed: Unexpected 'filter' output from embedded field 'explore.ngram.tokens.token.0.word'.",
		});
	});

	test('lays out only the length control horizontally', () => {
		const { runtime } = createFixture(['large', 'horizontal']);
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});

		const length = wrapper.findComponent(NumberField);
		expect(length.props('variant')).toEqual(['large', 'horizontal']);
		expect(length.find('.blf-field-horizontal').exists()).toBe(true);
		expect(wrapper.get('.blf-token-sequence-field').classes()).not.toContain('blf-field-horizontal');

		const selectors = wrapper.findAllComponents(SelectField);
		expect(selectors).toHaveLength(2);
		expect(selectors.every(selector => selector.props('variant') === 'large')).toBe(true);
		expect(selectors.every(selector => !selector.classes().includes('blf-field-horizontal'))).toBe(true);
		const editors = wrapper.findAllComponents(TextField);
		expect(editors).toHaveLength(2);
		expect(editors.every(editor => editor.props('variant') === 'large')).toBe(true);
	});

	test('hides labels on token selectors and editors', () => {
		const { runtime } = createFixture();
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});

		const selectors = wrapper.findAllComponents(SelectField);
		const editors = wrapper.findAllComponents(TextField);
		expect(selectors).toHaveLength(2);
		expect(editors).toHaveLength(2);
		expect(selectors.every(selector => selector.props('showLabel') === false)).toBe(true);
		expect(editors.every(editor => editor.props('showLabel') === false)).toBe(true);
	});

	test('growing the sequence appends fresh default tokens', async () => {
		const { runtime } = createFixture();
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});

		await wrapper.findComponent(NumberField).get('input[type="number"]').setValue('4');
		expect(sequenceState(runtime)).toHaveLength(4);
		expect(sequenceState(runtime)[3]).toEqual({ fieldId: 'word', fieldState: { value: '', caseSensitive: false } });
	});

	test('changing a token selector replaces its child state with controller defaults', async () => {
		const { runtime } = createFixture();
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});
		sequenceState(runtime)[0].fieldState = { value: 'draft', caseSensitive: false } satisfies TextFieldState;
		wrapper.findAllComponents(SelectField)[0].vm.$emit('update:modelValue', ['lemma']);
		await nextTick();
		expect(sequenceState(runtime)[0]).toEqual({
			fieldId: 'lemma',
			fieldState: { exact: true, lemma: '' },
		});
	});

	test('accepts scalar selector updates and writes nested field state immutably', async () => {
		const { runtime } = createFixture();
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});

		wrapper.findAllComponents(SelectField)[0].vm.$emit('update:modelValue', 'lemma');
		await nextTick();
		expect(sequenceState(runtime)[0]).toEqual({ fieldId: 'lemma', fieldState: { exact: true, lemma: '' } });

		wrapper.findAllComponents(FieldRenderer)[1].vm.$emit('update:modelValue', { exact: false, lemma: 'walk' });
		await nextTick();
		expect(sequenceState(runtime)[0]).toEqual({ fieldId: 'lemma', fieldState: { exact: false, lemma: 'walk' } });

		wrapper.findAllComponents(SelectField)[0].vm.$emit('update:modelValue', 'lemma');
		await nextTick();
		expect(sequenceState(runtime)[0]).toEqual({ fieldId: 'lemma', fieldState: { exact: false, lemma: 'walk' } });
	});

	test('a patt override disables and clearing it re-enables nested token editors', async () => {
		const { runtime } = createFixture();
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});
		runtime.state.rawOverrides.value.patt = '[word="fixed"]';
		await nextTick();
		expect(wrapper.findAllComponents(TextField)[0].props('disabled')).toBe(true);
		delete runtime.state.rawOverrides.value.patt;
		await nextTick();
		expect(wrapper.findAllComponents(TextField)[0].props('disabled')).toBe(false);
	});

	test('shrinking then regrowing creates fresh trailing token state', async () => {
		const { runtime } = createFixture();
		const wrapper = mount(FormSystem, {
			props: {
				runtime,
				rootId: 'explore.ngram',
			},
		});
		sequenceState(runtime)[1].fieldState = { value: 'discarded', caseSensitive: false } satisfies TextFieldState;
		await wrapper.findComponent(NumberField).get('input[type="number"]').setValue('1');
		expect(sequenceState(runtime)).toHaveLength(1);
		await wrapper.findComponent(NumberField).get('input[type="number"]').setValue('2');
		expect(sequenceState(runtime)[1]).toEqual({ fieldId: 'word', fieldState: { value: '', caseSensitive: false } });
	});

	test('round-trips indexed child-controller state through its one scoped field value', () => {
		const { runtime } = createFixture();
		runtime.state.state.value['explore.ngram.tokens'] = [
			{ fieldId: 'word', fieldState: { value: 'a,b;c=d', caseSensitive: false } },
			{ fieldId: 'lemma', fieldState: { exact: false, lemma: 'lopen' } },
		] satisfies TokenSequenceFieldState;
		const encoded = runtime.compile('explore.ngram').encoded['f.ngram-tokens'];
		expect(typeof encoded).toBe('string');
		expect(encoded).toContain('f=word');
		expect(encoded).toContain('f=lemma');

		const restored = restoreFieldState(runtime.definition.getField('explore.ngram.tokens')!, encoded!, runtime.definition.context);
		expect(restored).toEqual([
			{ fieldId: 'word', fieldState: { value: 'a,b;c=d', caseSensitive: false } },
			{ fieldId: 'lemma', fieldState: { exact: false, lemma: 'lopen' } },
		]);
	});

	test('restoration rejects token counts below the configured minimum', () => {
		const { runtime, sequence } = createFixture('large', 2);
		expect(() => restoreFieldState(sequence, '{f=word}', runtime.definition.context)).toThrow('Cannot restore token sequence length 1; expected 2-5.');
	});

	test('restoration rejects token counts above the configured maximum', () => {
		const { runtime, sequence } = createFixture();
		expect(() => restoreFieldState(sequence, Array.from({ length: 9 }, () => '{f=word}').join(','), runtime.definition.context)).toThrow('Cannot restore token sequence length 9; expected 1-5.');
	});

	test('restoration rejects unavailable child field ids', () => {
		const { runtime, sequence } = createFixture();
		expect(() => restoreFieldState(sequence, '{f=removed}', runtime.definition.context)).toThrow("Cannot restore token 1 field 'removed' because it is not available.");
	});

	test('restoration reports nested child codec failures', () => {
		const { runtime, sequence } = createFixture();
		expect(() => restoreFieldState(sequence, '{f=word;v=invalid}', runtime.definition.context)).toThrow('nested child error');
	});
});
