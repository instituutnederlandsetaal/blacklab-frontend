import { describe, expect, test } from 'vitest';

import { buildQueryIR, createDefaultFormState, type QueryCombineMode } from '@/features/form';
import { compileQueryIR } from '@/features/form/model/compile/query-artifact';

import { TestTextField, createTestBuilder, parentFormProbeView, testTextController } from './helpers';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

const sharedStateExpectation = {
	lemma: { value: 'lopen' },
	word: { value: 'water' },
};

const sharedSummaryExpectation = [
	{ id: 'search.word', label: 'Word', value: 'water' },
	{ id: 'search.lemma', label: 'Lemma', value: 'lopen' },
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

	return builder;
}

describe('form model state', () => {
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

		expect(createDefaultFormState(builder.getRoot(), builder.context).state).toEqual({
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
		const { query, summaries } = buildQueryIR(fixture.getRoot(), fixture.state.getRawState(), fixture.context);
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

		expect(builder.state.uiState.value).toEqual({
			search: 'search.simple',
			'search.simple': 'search.simple.filters',
			'search.simple.filters': 'search.simple.filters.bibliographic',
		});
	});
});
