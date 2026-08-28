import { describe, expect, test, vi } from 'vitest';
import { isReactive, reactive } from 'vue';

import { createDefaultFormState, createFormFieldNode, hasEmissions, searchTarget, type QueryCombineMode } from '@/features/form';
import { annotation, filter } from '@/features/form/model/types/form-query-ir';
import type { ContainerNode, FormBoundaryNode, FormViewNode } from '@/features/form/model/types/form-shape';

import { TestTextField, createTestBuilder, createTestContext, createTestRuntime, parentFormProbeView, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

const sharedStateExpectation = {
	lemma: { value: 'lopen' },
	word: { value: 'water' },
};

const compositionExpectations: Array<{
	combine: QueryCombineMode;
	name: string;
	expectedPatt: string;
}> = [
	{
		combine: 'and',
		name: 'and folds child token fields into one token projection',
		expectedPatt: '[word="water" & lemma="lopen"]',
	},
	{
		combine: 'or',
		name: 'or folds child token fields into one token projection',
		expectedPatt: '[word="water" | lemma="lopen"]',
	},
	{
		combine: 'sequence',
		name: 'sequence preserves child order when composing the query projection',
		expectedPatt: '[word="water"] [lemma="lopen"]',
	},
];

function createCompositionFixture(combine: QueryCombineMode) {
	const builder = createTestBuilder();
	const word = builder.newField('search.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	const lemma = builder.newField('search.lemma', testTextController, TestTextField, {
		annotationId: 'lemma',
		displayName: 'Lemma',
	});
	builder.newForm('search.form', ContainerRenderer, { title: 'Search' }).addChildren(builder.newContainer('search.group', ContainerRenderer, { combine }).addChildren(word, lemma));
	const runtime = createTestRuntime(builder);
	runtime.state.state.value[word.id] = sharedStateExpectation.word;
	runtime.state.state.value[lemma.id] = sharedStateExpectation.lemma;

	return runtime;
}

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

function createNonReactiveBoundaryFixture() {
	const builder = createTestBuilder(reactive(createTestContext()));
	const createdController = { ...testTextController };
	const root = builder.newContainer('root', ContainerRenderer, {});
	const createdForm = builder.newForm('created.form', ContainerRenderer, { title: 'Search' });
	const createdField = builder.newField('created.field', createdController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	const createdView = builder.newView('created.view', parentFormProbeView, {});
	const createdContainer = builder.newContainer('created.container', ContainerRenderer, {}).addChildren(createdField, createdView);
	createdForm.addChildren(createdContainer);
	root.addChildren(createdForm);

	const adoptedController = { ...testTextController };
	const adoptedField = createFormFieldNode('adopted.field', adoptedController, TestTextField, {
		annotationId: 'lemma',
		displayName: 'Lemma',
	});
	const adoptedView = { id: 'adopted.view', kind: 'view', component: parentFormProbeView } satisfies FormViewNode;
	const adoptedContainer = {
		id: 'adopted.container',
		kind: 'container',
		component: ContainerRenderer,
		children: [adoptedField, adoptedView],
	} satisfies ContainerNode;
	const adoptedForm = { id: 'adopted.form', kind: 'form', component: ContainerRenderer, children: [], target: searchTarget } satisfies FormBoundaryNode;
	root.addChildren(adoptedContainer, adoptedForm);

	return builder;
}

const createdBoundaryNodeIds = ['created.form', 'created.field', 'created.view', 'created.container'];
const adoptedBoundaryNodeIds = ['adopted.field', 'adopted.view', 'adopted.container', 'adopted.form'];

describe('form model state', () => {
	test('keeps builder-created and adopted graph nodes non-reactive', () => {
		const builder = createNonReactiveBoundaryFixture();
		const registeredCreatedNodes = createdBoundaryNodeIds.map(id => builder.getNode(id));
		const registeredAdoptedNodes = adoptedBoundaryNodeIds.map(id => builder.getNode(id));

		expect(registeredCreatedNodes.every(node => node != null && !isReactive(node))).toBe(true);
		expect(registeredAdoptedNodes.every(node => node != null && !isReactive(node))).toBe(true);
	});

	test('keeps field controllers non-reactive after node attachment', () => {
		const builder = createNonReactiveBoundaryFixture();
		const registeredCreatedController = builder.getField('created.field')?.controller;
		const registeredAdoptedController = builder.getField('adopted.field')?.controller;

		expect(registeredCreatedController).toBeDefined();
		expect(registeredAdoptedController).toBeDefined();
		expect(isReactive(registeredCreatedController)).toBe(false);
		expect(isReactive(registeredAdoptedController)).toBe(false);
	});

	test('keeps components non-reactive after node attachment', () => {
		const builder = createNonReactiveBoundaryFixture();
		const registeredComponents = [...createdBoundaryNodeIds, ...adoptedBoundaryNodeIds].map(id => builder.getNode(id)?.component);

		expect(registeredComponents.every(component => component != null && !isReactive(component))).toBe(true);
	});

	test('copies a reactive definition context into a non-reactive snapshot', () => {
		const source = reactive(createTestContext());
		const builder = createTestBuilder(source);

		expect(isReactive(source)).toBe(true);
		expect(isReactive(source.corpus)).toBe(true);
		expect(isReactive(builder.context)).toBe(false);
		expect(isReactive(builder.context.corpus)).toBe(false);
	});

	test('keeps mutable runtime state off the builder definition', () => {
		const builder = createTestBuilder();
		builder.newForm('search.form', ContainerRenderer, {});

		expect('state' in builder).toBe(false);
	});

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

	test('runtime construction passes the field and definition context to createDefaultState', () => {
		const { builder, createDefaultState, field } = createContextDefaultFixture();

		const runtime = createTestRuntime(builder);

		expect(createDefaultState).toHaveBeenCalledOnce();
		expect(createDefaultState).toHaveBeenCalledWith(field, builder.context);
		expect(runtime.state.state.value[field.id]).toEqual({ value: 'test-corpus:1' });
	});

	test('reset recalculates field defaults with the definition context', () => {
		const { builder, createDefaultState, field } = createContextDefaultFixture();
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[field.id] = { value: 'changed' };
		createDefaultState.mockClear();

		runtime.reset();

		expect(createDefaultState).toHaveBeenCalledOnce();
		expect(createDefaultState).toHaveBeenCalledWith(field, builder.context);
		expect(runtime.state.state.value[field.id]).toEqual({ value: 'test-corpus:2' });
	});

	test('prefers the first form root over earlier reusable orphan containers', () => {
		const builder = createTestBuilder();
		builder.newContainer('reusable.orphan', ContainerRenderer, {});
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });

		expect(builder.getRoot().id).toBe(form.id);
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

	test('flattens form and view configuration onto their nodes', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search', class: 'search-form' });
		const view = builder.newView('search.form.probe', parentFormProbeView, { title: 'Probe', class: 'probe-view' });

		form.addChildren(view);

		expect(form).toMatchObject({ title: 'Search', class: 'search-form' });
		expect(view).toMatchObject({ title: 'Probe', class: 'probe-view', component: parentFormProbeView });
		expect('config' in form).toBe(false);
		expect('config' in view).toBe(false);
	});

	test('createFormFieldNode constructs a complete standalone field', () => {
		const field = createFormFieldNode({ id: 'search.word' }, testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});

		expect(field).toMatchObject({
			id: 'search.word',
			kind: 'field',
			controller: testTextController,
			component: TestTextField,
			annotationId: 'word',
			displayName: 'Word',
		});
	});

	test('adding a standalone field adopts it into the graph and default state', () => {
		const builder = createTestBuilder();
		const field = createFormFieldNode('search.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});

		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(field);

		expect(builder.getField(field.id)).toBe(field);
		expect(createDefaultFormState(builder.context, form).state).toEqual({
			'search.word': { value: '' },
		});
	});

	test('uses inheritedVariant when field configuration has no variant', () => {
		const field = createFormFieldNode(
			{
				id: 'composite.token.0.word',
				inheritedVariant: 'simple',
			},
			testTextController,
			TestTextField,
			{
				annotationId: 'word',
				displayName: 'Word',
			},
		);

		expect(field.variant).toBe('simple');
	});

	test.each(compositionExpectations)('$name', ({ combine, expectedPatt }) => {
		const runtime = createCompositionFixture(combine);

		expect(runtime.compile('search.form').params.patt).toBe(expectedPatt);
	});

	test('evaluates and includes a reused field query once per graph occurrence', () => {
		const collect = vi.fn(testTextController.collect);
		const { builder, form, sharedField } = createReusedFieldFixture({ ...testTextController, collect });
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[sharedField.id] = { value: 'water' };
		collect.mockClear();

		const compiled = runtime.compile(form.id);

		expect(collect).toHaveBeenCalledTimes(2);
		expect(compiled.params.patt).toBe('[word="water"] [word="water"]');
	});

	test('emits one summary for a reused field reached through multiple graph paths', () => {
		const { builder, form, sharedField } = createReusedFieldFixture();
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[sharedField.id] = { value: 'water' };

		const compiled = runtime.compile(form.id);

		expect(compiled.summaries).toEqual([{ label: 'Word', value: 'water', summaryType: ['patt'] }]);
	});

	test('normalizes summary types from the controller output contract', () => {
		const builder = createTestBuilder();
		const explicitController = {
			...testTextController,
			summarize: (_config, _runtime, _state, emit) => emit({ label: 'Explicit', value: 'value', summaryType: ['filter'] }),
		} satisfies typeof testTextController;
		const noOutputController = {
			...testTextController,
			outputs: [],
			collect() {},
			summarize: (_config, _runtime, _state, emit) => emit({ label: 'Frontend only', value: 'value' }),
		} satisfies typeof testTextController;
		const explicit = builder.newField('summary.explicit', explicitController, TestTextField, { annotationId: 'explicit', displayName: 'Explicit' });
		const inherited = builder.newField('summary.inherited', testTextController, TestTextField, { annotationId: 'inherited', displayName: 'Inherited' });
		const frontendOnly = builder.newField('summary.frontend', noOutputController, TestTextField, { annotationId: 'frontend', displayName: 'Frontend only' });
		const form = builder.newForm('summary.form', ContainerRenderer, {}).addChildren(explicit, inherited, frontendOnly);
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[inherited.id] = { value: 'value' };

		expect(runtime.compile(form.id).summaries).toEqual([
			{ label: 'Explicit', value: 'value', summaryType: ['filter'] },
			{ label: 'Inherited', value: 'value', summaryType: ['patt'] },
			{ label: 'Frontend only', value: 'value', summaryType: [] },
		]);
	});

	test('gathers reused field channels at their intended frequencies', () => {
		const collect = vi.fn(testTextController.collect);
		const summarize = vi.fn(testTextController.summarize);
		const key = vi.fn(testTextController.persistence.key);
		const getResultPreset = vi.fn(() => undefined);
		const encode = vi.spyOn(testTextController.persistence.codec, 'encode');
		const { builder, form, sharedField } = createReusedFieldFixture({
			...testTextController,
			collect,
			summarize,
			persistence: { ...testTextController.persistence, key },
			getResultPreset,
		});
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[sharedField.id] = { value: 'water' };

		runtime.compile(form.id);

		expect(collect).toHaveBeenCalledTimes(2);
		expect(summarize).toHaveBeenCalledOnce();
		expect(key).toHaveBeenCalledOnce();
		expect(encode).toHaveBeenCalledOnce();
		expect(getResultPreset).toHaveBeenCalledTimes(2);
		encode.mockRestore();
	});

	test('compiles shared-DAG summaries with active-child semantics but without persistence or preset work', () => {
		const collect = vi.fn(testTextController.collect);
		const summarize = vi.fn(testTextController.summarize);
		const key = vi.fn(testTextController.persistence.key);
		const encode = vi.spyOn(testTextController.persistence.codec, 'encode');
		const getResultPreset = vi.fn(() => 'table' as const);
		const firstProducer = vi.fn((emit: Parameters<NonNullable<ContainerNode['activeChildOutputProducers']>[string]>[0]) => emit('filter', filter('category', 'literal', 'newspaper')!));
		const secondProducer = vi.fn((emit: Parameters<NonNullable<ContainerNode['activeChildOutputProducers']>[string]>[0]) => emit('filter', filter('category', 'literal', 'book')!));
		const builder = createTestBuilder();
		const sharedField = builder.newField(
			'shared.word',
			{
				...testTextController,
				collect,
				summarize,
				persistence: { ...testTextController.persistence, key },
				getResultPreset,
			},
			TestTextField,
			{ annotationId: 'word', displayName: 'Word' },
		);
		const first = builder.newContainer('first.tabs', ContainerRenderer, {});
		const second = builder.newContainer('second.tabs', ContainerRenderer, {});
		first.prependChild(sharedField, { outputWhenActive: firstProducer });
		second.prependChild(sharedField, { outputWhenActive: secondProducer });
		const sequence = builder.newContainer('search.sequence', ContainerRenderer, { combine: 'sequence' }).addChildren(first, second);
		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(sequence);
		const runtime = createTestRuntime(builder);
		runtime.state.state.value[sharedField.id] = { value: 'water' };

		const summary = runtime.compileSummary(form.id);

		expect(summary).toEqual({
			params: { patt: '[word="water"] [word="water"]', filter: '(category:(newspaper) AND category:(book))' },
			summaries: [{ label: 'Word', value: 'water', summaryType: ['patt'] }],
		});
		expect(collect).toHaveBeenCalledTimes(2);
		expect(summarize).toHaveBeenCalledOnce();
		expect(firstProducer).toHaveBeenCalledOnce();
		expect(secondProducer).toHaveBeenCalledOnce();
		expect(key).not.toHaveBeenCalled();
		expect(encode).not.toHaveBeenCalled();
		expect(getResultPreset).not.toHaveBeenCalled();

		collect.mockClear();
		summarize.mockClear();
		firstProducer.mockClear();
		secondProducer.mockClear();
		const compiled = runtime.compile(form.id);

		expect(summary).toEqual({ params: compiled.params, summaries: compiled.summaries });
		expect(collect).toHaveBeenCalledTimes(2);
		expect(summarize).toHaveBeenCalledOnce();
		expect(firstProducer).toHaveBeenCalledOnce();
		expect(secondProducer).toHaveBeenCalledOnce();
		expect(key).toHaveBeenCalledOnce();
		expect(encode).toHaveBeenCalledOnce();
		expect(getResultPreset).toHaveBeenCalledTimes(2);

		runtime.state.rawOverrides.value.patt = '[word="override"]';
		expect(runtime.compileSummary(form.id).params.patt).toBe('[word="override"]');
		encode.mockRestore();
	});

	test('checks badge emissions without evaluating auxiliary channels', () => {
		const collect = vi.fn(testTextController.collect);
		const summarize = vi.fn(testTextController.summarize);
		const key = vi.fn(testTextController.persistence.key);
		const encode = vi.spyOn(testTextController.persistence.codec, 'encode');
		const getResultPreset = vi.fn(() => 'table' as const);
		const { builder, sharedField } = createReusedFieldFixture({
			...testTextController,
			collect,
			summarize,
			persistence: { ...testTextController.persistence, key },
			getResultPreset,
		});

		expect(hasEmissions(sharedField, { value: 'water' }, builder.context)).toBe(true);
		expect(collect).toHaveBeenCalledOnce();
		expect(summarize).not.toHaveBeenCalled();
		expect(key).not.toHaveBeenCalled();
		expect(encode).not.toHaveBeenCalled();
		expect(getResultPreset).not.toHaveBeenCalled();
		encode.mockRestore();
	});

	test('parents assign independent active-child contributions to a shared child', () => {
		const builder = createTestBuilder();
		const shared = builder.newContainer('shared.tab', ContainerRenderer, { title: 'Shared' });
		const firstAlternative = builder.newContainer('first.alternative', ContainerRenderer, { title: 'First alternative' });
		const secondAlternative = builder.newContainer('second.alternative', ContainerRenderer, { title: 'Second alternative' });
		const first = builder.newContainer('first.tabs', ContainerRenderer, {}).addChildren(firstAlternative);
		const second = builder.newContainer('second.tabs', ContainerRenderer, {}).addChildren(secondAlternative);
		first.prependChild(shared, { outputWhenActive: emit => emit('filter', filter('category', 'literal', 'newspaper')!) });
		second.prependChild(shared, { outputWhenActive: emit => emit('filter', filter('category', 'literal', 'book')!) });
		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(first, second);
		const runtime = createTestRuntime(builder);

		expect(runtime.compile(form.id).params.filter).toBe('(category:(newspaper) AND category:(book))');

		runtime.state.uiState.value[first.id] = firstAlternative.id;
		expect(runtime.compile(form.id).params.filter).toBe('category:(book)');
	});

	test('validates active-child values before container collection', () => {
		const builder = createTestBuilder();
		const selected = builder.newContainer('search.tabs.selected', ContainerRenderer, {});
		const tabs = builder.newContainer('search.tabs', ContainerRenderer, {});
		tabs.prependChild(selected, {
			outputWhenActive: emit => {
				(emit as unknown as (name: string, value: unknown) => void)('patt', { type: 'cql-raw', cql: null });
				emit('filter', filter('author', 'literal', 'Austen')!);
			},
		});
		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(tabs);

		const compiled = createTestRuntime(builder).compile(form.id);

		expect(compiled.params).toEqual({ filter: 'author:(Austen)' });
		expect(compiled.issues).toContainEqual({ severity: 'warning', message: `Controller for '${tabs.id}' emitted malformed output 'patt'; ignoring it.` });
	});

	test('active-child contributions preserve nested parent combine modes', () => {
		const builder = createTestBuilder();
		const word = builder.newField('search.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const lemma = builder.newField('search.lemma', testTextController, TestTextField, {
			annotationId: 'lemma',
			displayName: 'Lemma',
		});
		const semanticTab = builder.newContainer('search.semantic', ContainerRenderer, {});
		const alternatives = builder.newContainer('search.alternatives', ContainerRenderer, { combine: 'or' });
		alternatives.prependChild(semanticTab, { outputWhenActive: emit => emit('patt', annotation('pos', 'wildcard', 'N')!) });
		alternatives.prependChild(lemma);
		const sequence = builder.newContainer('search.sequence', ContainerRenderer, { combine: 'sequence' }).addChildren(word, alternatives);
		const form = builder.newForm('search.form', ContainerRenderer, {}).addChildren(sequence);
		const state = createDefaultFormState(builder.context, builder.getRoot());
		state.state[word.id] = { value: 'water' };
		state.state[lemma.id] = { value: 'lopen' };
		state.uiState[alternatives.id] = semanticTab.id;

		const compiled = createTestRuntime(builder);
		compiled.state.replaceState(state);

		expect(compiled.compile(form.id).params.patt).toBe('[word="water"] [lemma="lopen" | pos="N"]');
	});

	test('default runtime UI state selects the first child of each nested container', () => {
		const builder = createTestBuilder();
		builder.newContainer('search', ContainerRenderer, { variant: 'tabs' }).addChildren(
			builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(
				builder
					.newContainer('search.simple.filters', ContainerRenderer, {
						variant: 'small-tabs',
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

	test('builder form registry includes registered sibling forms', () => {
		const builder = createTestBuilder();
		builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });

		expect(Object.keys(builder.formsMap).sort()).toEqual(['search.extended', 'search.simple']);
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
