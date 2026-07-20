// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import { nextTick } from 'vue';

import { createFormFieldNode, defineFieldController, FormRuntime, FormSystem, object, restoreControllerState, scalar } from '@/features/form';
import { createDefaultTextFieldState, type TextFieldDefinition, type TextFieldState } from '@/features/form/fields/generic/text-field';
import type { TokenSequenceCreateField, TokenSequenceFieldState } from '@/features/form/fields/token-sequence-field';
import { queryFragment, token, tokenPredicate } from '@/features/form/model/compile/query-artifact';
import { tokenSequenceController } from '@/features/form/model/controllers/token-sequence-controller';

import { createTestBuilder } from './helpers';

import NumberField from '@/features/form/fields/generic/NumberField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import TokenSequenceField from '@/features/form/fields/TokenSequenceField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

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
	affectsBlackLabParameters: ['patt'],
	getQueryContribution(config, _runtime, state) {
		if (!state.value) return queryFragment();
		return queryFragment(token(tokenPredicate('wildcard', config.annotationId, state.value, state.caseSensitive)));
	},
});

function createFixture() {
	const builder = createTestBuilder();
	const sequence = builder.newField('explore.ngram.tokens', tokenSequenceController, TokenSequenceField, {
		createField: (({ annotationId, ...binding }) =>
			createFormFieldNode(binding, childController, TextField, {
				annotationId,
				displayName: annotationId === 'word' ? 'Word' : 'Lemma',
				persistKey: `${annotationId}-value`,
				showLabel: false,
			})) satisfies TokenSequenceCreateField,
		selectorOptions: [
			{ value: 'word', label: 'Word' },
			{ value: 'lemma', label: 'Lemma' },
		],
		defaultFieldId: 'word',
		minLength: 1,
		maxLength: 5,
		defaultLength: 2,
		lengthDisplayName: 'N-gram length',
		selectorDisplayName: 'Property',
		selectorPlaceholder: 'Choose a property',
		persistKey: 'ngram-tokens',
		variant: 'large',
	});
	builder.newForm('explore.ngram', ContainerRenderer, {}).addChildren(sequence);
	return { builder, runtime: new FormRuntime(builder), sequence };
}

function sequenceState(runtime: FormRuntime): TokenSequenceFieldState {
	return runtime.state.state.value['explore.ngram.tokens'] as TokenSequenceFieldState;
}

describe('token sequence composite field', () => {
	test('creates active token defaults and compiles blank children as ordered any-token patterns', () => {
		const { runtime } = createFixture();
		const state = sequenceState(runtime);
		expect(state).toEqual([
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
		]);

		state[0].fieldState = { value: 'water', caseSensitive: false } satisfies TextFieldState;
		state[1] = { fieldId: 'lemma', fieldState: { value: '', caseSensitive: false } satisfies TextFieldState };
		expect(runtime.compile('explore.ngram').patt).toBe('[word="(?i)water"] []');

		state[1].fieldState = { value: 'run*', caseSensitive: true } satisfies TextFieldState;
		expect(runtime.compile('explore.ngram').patt).toBe('[word="(?i)water"] [lemma="run.*"]');
	});

	test('grows, shrinks, and resets child state when its selector changes', async () => {
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

		sequenceState(runtime)[0].fieldState = { value: 'draft', caseSensitive: false } satisfies TextFieldState;
		wrapper.findAllComponents(SelectField)[0].vm.$emit('update:modelValue', ['lemma']);
		await nextTick();
		expect(sequenceState(runtime)[0]).toEqual({
			fieldId: 'lemma',
			fieldState: { value: '', caseSensitive: false },
		});
		expect(wrapper.findAllComponents(SelectField)[0].props('showLabel')).toBe(false);
		expect(wrapper.findAllComponents(TextField)[0].props('showLabel')).toBe(false);
		expect(wrapper.findAllComponents(TextField)[0].props('variant')).toBe('large');

		runtime.state.rawOverrides.value.patt = '[word="fixed"]';
		await nextTick();
		expect(wrapper.findAllComponents(TextField)[0].props('disabled')).toBe(true);
		delete runtime.state.rawOverrides.value.patt;
		await nextTick();

		await wrapper.findComponent(NumberField).get('input[type="number"]').setValue('1');
		expect(sequenceState(runtime)).toHaveLength(1);
		await wrapper.findComponent(NumberField).get('input[type="number"]').setValue('2');
		expect(sequenceState(runtime)[1]).toEqual({ fieldId: 'word', fieldState: { value: '', caseSensitive: false } });
	});

	test('round-trips indexed child-controller state through its one scoped field value', () => {
		const { runtime } = createFixture();
		runtime.state.state.value['explore.ngram.tokens'] = [
			{ fieldId: 'word', fieldState: { value: 'a,b;c=d', caseSensitive: false } },
			{ fieldId: 'lemma', fieldState: { value: 'lopen', caseSensitive: false } },
		] satisfies TokenSequenceFieldState;
		const encoded = runtime.compile('explore.ngram').encoded['f.ngram-tokens'];
		expect(typeof encoded).toBe('string');
		expect(encoded).toContain('f=word');
		expect(encoded).toContain('f=lemma');

		const restored = restoreControllerState(tokenSequenceController, encoded!, runtime.definition.getField('explore.ngram.tokens') as never, runtime.definition.context);
		expect(restored).toEqual([
			{ fieldId: 'word', fieldState: { value: 'a,b;c=d', caseSensitive: false } },
			{ fieldId: 'lemma', fieldState: { value: 'lopen', caseSensitive: false } },
		]);
	});

	test('throws on incompatible composite and nested child state', () => {
		const { runtime, sequence } = createFixture();
		expect(() => restoreControllerState(tokenSequenceController, Array.from({ length: 9 }, () => '{f=word}').join(','), sequence, runtime.definition.context)).throws();
		expect(() => restoreControllerState(tokenSequenceController, '{f=removed}', sequence, runtime.definition.context)).throws();
		expect(() => restoreControllerState(tokenSequenceController, '{f=word;v=invalid}', sequence, runtime.definition.context)).throws();
	});
});
