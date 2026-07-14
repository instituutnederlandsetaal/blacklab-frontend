import { describe, expect, test } from 'vitest';
import { isReactive, reactive } from 'vue';

import { buildQueryIR, createDefaultFormState, type QueryCombineMode } from '@/features/form';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';

import { TestTextField, createTestBuilder, createTestContext, createTestRuntime, parentFormProbeView, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

const sharedStateExpectation = {
	lemma: { value: 'lopen' },
	word: { value: 'water' },
};

const sharedSummaryExpectation = [
	{ id: 'search.word', label: 'Word', value: 'water', summaryType: ['patt'] },
	{ id: 'search.lemma', label: 'Lemma', value: 'lopen', summaryType: ['patt'] },
];

const compositionExpectations: Array<{
	combine: QueryCombineMode;
	name: string;
	expected: {
		compiled: {
			patt: string;
			filter: null;
			searchfield: null;
		};
		summaries: typeof sharedSummaryExpectation;
	};
}> = [
	{
		combine: 'and',
		name: 'and folds child token fields into one token projection',
		expected: {
			compiled: {
				patt: '[word="(?i)water" & lemma="(?i)lopen"]',
				filter: null,
				searchfield: null,
			},
			summaries: sharedSummaryExpectation,
		},
	},
	{
		combine: 'or',
		name: 'or folds child token fields into one token projection',
		expected: {
			compiled: {
				patt: '[word="(?i)water" | lemma="(?i)lopen"]',
				filter: null,
				searchfield: null,
			},
			summaries: sharedSummaryExpectation,
		},
	},
	{
		combine: 'sequence',
		name: 'sequence preserves child order when composing the query projection',
		expected: {
			compiled: {
				patt: '[word="(?i)water"] [lemma="(?i)lopen"]',
				filter: null,
				searchfield: null,
			},
			summaries: sharedSummaryExpectation,
		},
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

describe('form model state', () => {
	test('keeps the definition plain and runtime sessions isolated', () => {
		const builder = createTestBuilder(reactive(createTestContext()));
		const field = builder.newField('search.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		builder.newForm('search.form', ContainerRenderer, { title: 'Search' }).addChildren(field);
		const first = createTestRuntime(builder);
		const second = createTestRuntime(builder);

		expect(isReactive(builder.getRoot())).toBe(false);
		expect(isReactive(builder.context)).toBe(false);
		expect(isReactive(builder.context.corpus)).toBe(false);
		expect('state' in builder).toBe(false);

		first.state.state.value[field.id] = { value: 'water' };
		expect(second.state.state.value[field.id]).toEqual({ value: '' });
	});

	test('field defaults receive definition context during runtime creation and reset', () => {
		const builder = createTestBuilder();
		const contextAwareController = {
			...testTextController,
			createDefaultState: (_field: unknown, context: ReturnType<typeof createTestContext>) => ({ value: context.corpus.indexId ?? '' }),
		};
		const field = builder.newField('search.context-aware', contextAwareController, TestTextField, {
			annotationId: 'word',
			displayName: 'Context aware',
		});
		builder.newForm('search.form', ContainerRenderer, { title: 'Search' }).addChildren(field);

		const runtime = createTestRuntime(builder);
		expect(runtime.state.state.value[field.id]).toEqual({ value: 'test-corpus' });
		runtime.state.state.value[field.id] = { value: 'changed' };
		runtime.reset();
		expect(runtime.state.state.value[field.id]).toEqual({ value: 'test-corpus' });
	});

	test('prefers the first form root over earlier reusable orphan containers', () => {
		const builder = createTestBuilder();
		builder.newContainer('reusable.orphan', ContainerRenderer, {});
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });

		expect(builder.getRoot().id).toBe(form.id);
	});

	test('rejects child edges that would create a graph cycle', () => {
		const builder = createTestBuilder();
		const first = builder.newContainer('first', ContainerRenderer, {});
		const second = builder.newContainer('second', ContainerRenderer, {});
		first.addChildren(second);

		expect(() => second.addChildren(first)).toThrow('would create a form graph cycle');
	});

	test('createDefaultFormState initializes each reused field once', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, { variant: 'tabs' });
		const sharedField = builder.newField('shared.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Shared word',
		});
		root.addChildren(
			builder.newForm('search.first', ContainerRenderer, { title: 'First' }).addChildren(sharedField),
			builder.newForm('search.second', ContainerRenderer, { title: 'Second' }).addChildren(sharedField),
		);

		expect(createDefaultFormState(createTestContext(), builder.getRoot()).state).toEqual({
			'shared.word': { value: '' },
		});
	});

	test('builders materialize flat runtime view nodes with default config objects', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });
		const view = builder.newView('search.form.probe', parentFormProbeView, {});

		form.addChildren(view);

		expect('config' in form).toBe(false);
		expect('config' in view).toBe(false);
		expect(view.component).toBe(parentFormProbeView);
		expect('view' in view).toBe(false);
	});

	test.each(compositionExpectations)('$name', ({ combine, expected }) => {
		const fixture = createCompositionFixture(combine);
		const { query, summaries } = buildQueryIR(fixture.definition.getRoot(), fixture.state.getRawState(), fixture.definition.context);
		const compiled = compileQueryIR(query);

		expect(compiled).toEqual(expected.compiled);
		expect(summaries).toEqual(expected.summaries);
	});

	test('builder state picks the first active branch for nested container-like nodes', () => {
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

		expect(runtime.state.getRawState()).toEqual({ state: { [field.id]: { value: 'water' } }, uiState: {}, rawOverrides: {} });
	});
});
