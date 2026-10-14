import { describe, expect, test, vi } from 'vitest';
import { toRaw } from 'vue';

import { createDefaultFormState } from '@/features/form/model/state';

import { TestTextField, createTestBuilder, type createTestContext, createTestRuntime, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('runtime state lifecycle', () => {
	function createContextDefaultFixture() {
		let generation = 0;
		const createDefaultState = vi.fn((_field: unknown, context: ReturnType<typeof createTestContext>) => ({
			value: `${context.corpus.indexId}:${++generation}`,
		}));
		const builder = createTestBuilder();
		const controller = { ...testTextController, createDefaultState };
		const field = builder.newField('search.context-aware', controller, TestTextField, {
			annotationId: 'word',
			displayName: 'Context aware',
		});
		builder.newForm('search.form', ContainerRenderer, { title: 'Search' }).addChildren(field);
		return { builder, createDefaultState, field };
	}

	function createReusedFieldFixture(controller = testTextController) {
		const builder = createTestBuilder();
		const sharedField = builder.newField('shared.word', controller, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const sequence = builder
			.newContainer('search.sequence', ContainerRenderer, { combine: 'sequence' })
			.addChildren(
				builder.newContainer('search.sequence.first', ContainerRenderer, {}).addChildren(sharedField),
				builder.newContainer('search.sequence.second', ContainerRenderer, {}).addChildren(sharedField),
			);
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(sequence);
		return { builder, form, sharedField };
	}

	test('isolates every mutable state partition between runtimes from one definition', () => {
		const builder = createTestBuilder();
		const nestedController = {
			...testTextController,
			createDefaultState: () => ({
				value: '',
				composite: {
					tokens: [{ value: '', modifiers: ['literal'] }],
					settings: { caseSensitive: false },
				},
			}),
		};
		const field = builder.newField('search.word', nestedController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(field);
		const first = createTestRuntime(builder);
		const second = createTestRuntime(builder);
		type NestedState = ReturnType<typeof nestedController.createDefaultState>;
		const firstFieldState = first.state.state.value[field.id] as NestedState;

		firstFieldState.value = 'water';
		firstFieldState.composite.tokens[0].value = 'nested water';
		firstFieldState.composite.tokens[0].modifiers.push('case-sensitive');
		firstFieldState.composite.settings.caseSensitive = true;
		first.state.uiState.value[form.id] = null;
		first.state.rawOverrides.value.patt = '[word="water"]';

		expect(second.state.getReactiveState()).toEqual({
			state: {
				[field.id]: {
					value: '',
					composite: {
						tokens: [{ value: '', modifiers: ['literal'] }],
						settings: { caseSensitive: false },
					},
				},
			},
			uiState: { [form.id]: field.id },
			rawOverrides: {},
		});
	});

	test('runtime construction and reset calculate defaults with the field and definition context', () => {
		const { builder, createDefaultState, field } = createContextDefaultFixture();

		const runtime = createTestRuntime(builder);

		expect(createDefaultState).toHaveBeenCalledOnce();
		expect(createDefaultState).toHaveBeenCalledWith(field, builder.context);
		expect(runtime.state.state.value[field.id]).toEqual({ value: 'test-corpus:1' });

		runtime.state.state.value[field.id] = { value: 'changed' };
		createDefaultState.mockClear();

		runtime.reset();

		expect(createDefaultState).toHaveBeenCalledOnce();
		expect(createDefaultState).toHaveBeenCalledWith(field, builder.context);
		expect(runtime.state.state.value[field.id]).toEqual({ value: 'test-corpus:2' });
	});

	test('createDefaultFormState initializes nested UI and a reused field in one identity-deduped graph', () => {
		const createDefaultState = vi.fn(testTextController.createDefaultState);
		const { builder, sharedField } = createReusedFieldFixture({ ...testTextController, createDefaultState });

		const state = createDefaultFormState(builder.context, builder.getRoot());

		expect(createDefaultState).toHaveBeenCalledOnce();
		expect(createDefaultState).toHaveBeenCalledWith(sharedField, builder.context);
		expect(state.state[sharedField.id]).toEqual({ value: '' });
		expect(state.uiState).toEqual({
			'search.extended': 'search.sequence',
			'search.sequence': 'search.sequence.first',
			'search.sequence.first': sharedField.id,
			'search.sequence.second': sharedField.id,
		});
	});

	test('default runtime UI state selects the first child of each nested container', () => {
		const builder = createTestBuilder();
		builder.newContainer('search', ContainerRenderer, { mode: 'tabs' }).addChildren(
			builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(
				builder
					.newContainer('search.simple.filters', ContainerRenderer, {
						mode: 'tabs',
						tabSize: 'small',
					})
					.addChildren(
						builder.newContainer('search.simple.filters.bibliographic', ContainerRenderer, {
							title: 'Bibliographic',
						}),
						builder.newContainer('search.simple.filters.technical', ContainerRenderer, {
							title: 'Technical',
						}),
					),
			),
			builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }),
		);

		const runtime = createTestRuntime(builder);
		expect(runtime.state.uiState.value).toEqual({
			search: 'search.simple',
			'search.simple': 'search.simple.filters',
			'search.simple.filters': 'search.simple.filters.bibliographic',
		});
	});

	test('replaceState removes stale field and UI entries', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });
		const field = builder.newField('search.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);
		const runtime = createTestRuntime(builder);
		runtime.state.state.value.stale = { value: 'stale' };
		runtime.state.uiState.value.stale = 'stale';

		runtime.state.replaceState({ state: { [field.id]: { value: 'water' } }, uiState: {}, rawOverrides: {} });

		expect(runtime.state.getReactiveState()).toEqual({ state: { [field.id]: { value: 'water' } }, uiState: {}, rawOverrides: {} });
	});
});

describe('state replacement ownership', () => {
	test('replaceState clones caller-owned nested field state', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const field = builder.newField('search.simple.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		form.addChildren(field);
		const runtime = createTestRuntime(builder);
		const replacement = {
			state: structuredClone(toRaw(runtime.state.state.value)),
			uiState: structuredClone(toRaw(runtime.state.uiState.value)),
			rawOverrides: structuredClone(toRaw(runtime.state.rawOverrides.value)),
		};
		const callerOwned = {
			value: 'water',
			composite: {
				tokens: [{ value: 'nested water', modifiers: ['literal'] }],
				settings: { caseSensitive: false },
			},
		};
		replacement.state[field.id] = callerOwned;

		runtime.state.replaceState(replacement);
		callerOwned.value = 'changed later';
		callerOwned.composite.tokens[0].value = 'changed nested value';
		callerOwned.composite.tokens[0].modifiers.push('case-sensitive');
		callerOwned.composite.settings.caseSensitive = true;

		expect(runtime.state.state.value[field.id]).toEqual({
			value: 'water',
			composite: {
				tokens: [{ value: 'nested water', modifiers: ['literal'] }],
				settings: { caseSensitive: false },
			},
		});
	});
});
