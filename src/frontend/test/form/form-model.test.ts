import { describe, expect, test } from 'vitest';

import { buildFormQuery, createFormState, createInitialContainerUiStates, summarizeForm, type QueryCombineMode } from '@/features/form';
import { createCompiledQueryProjections } from '@/features/form/model/compile/query-artifact';

import { createTestBuilder, createTestContext, testTextController } from './helpers';

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
			cql: string;
			filter: null;
			searchField: null;
		};
		summaries: typeof sharedSummaryExpectation;
	};
}> = [
	{
		combine: 'allOf',
		name: 'allOf combines child fields with an AND boolean projection',
		expected: {
			compiled: {
				cql: '([word="(?i)water"] & [lemma="(?i)lopen"])',
				filter: null,
				searchField: null,
			},
			summaries: sharedSummaryExpectation,
		},
	},
	{
		combine: 'anyOf',
		name: 'anyOf combines child fields with an OR boolean projection',
		expected: {
			compiled: {
				cql: '([word="(?i)water"] | [lemma="(?i)lopen"])',
				filter: null,
				searchField: null,
			},
			summaries: sharedSummaryExpectation,
		},
	},
	{
		combine: 'sequence',
		name: 'sequence preserves child order when composing the query projection',
		expected: {
			compiled: {
				cql: '[word="(?i)water"] [lemma="(?i)lopen"]',
				filter: null,
				searchField: null,
			},
			summaries: sharedSummaryExpectation,
		},
	},
];

function assignState(fieldId: string, value: string, formState: ReturnType<typeof createFormState>) {
	formState.controllerState[fieldId] = { value };
}

function createCompositionFixture(combine: QueryCombineMode) {
	const builder = createTestBuilder();
	const form = builder.newForm('search.form', { title: 'Search' });
	const group = builder.newContainer('search.group', { config: { combine } });
	const word = builder.newField('search.word', testTextController, {
		annotationId: 'word',
		displayName: 'Word',
	});
	const lemma = builder.newField('search.lemma', testTextController, {
		annotationId: 'lemma',
		displayName: 'Lemma',
	});

	group.addChildren(word, lemma);
	form.addChildren(group);

	const definition = builder.build();
	const context = createTestContext();
	const state = createFormState(definition, context);
	assignState(word.id, sharedStateExpectation.word.value, state);
	assignState(lemma.id, sharedStateExpectation.lemma.value, state);

	return {
		context,
		form,
		state,
	};
}

describe('form model state', () => {
	test('createFormState initializes each reused field once', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', { config: { variant: 'tabs' } });
		const sharedField = builder.newField('shared.word', testTextController, {
			annotationId: 'word',
			displayName: 'Shared word',
		});
		const firstForm = builder.newForm('search.first', { title: 'First' });
		const secondForm = builder.newForm('search.second', { title: 'Second' });

		firstForm.addChildren(sharedField);
		secondForm.addChildren(sharedField);
		root.addChildren(firstForm, secondForm);

		expect(createFormState(builder.build(), createTestContext()).controllerState).toEqual({
			'shared.word': { value: '' },
		});
	});

	test.each(compositionExpectations)('$name', ({ combine, expected }) => {
		const fixture = createCompositionFixture(combine);
		const compiled = createCompiledQueryProjections(buildFormQuery(fixture.form, fixture.state, fixture.context));
		const summaries = summarizeForm(fixture.form, fixture.state, fixture.context);

		expect(compiled).toEqual(expected.compiled);
		expect(summaries).toEqual(expected.summaries);
	});

	test('createInitialContainerUiStates picks the first active branch for nested container-like nodes', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', { config: { variant: 'tabs' } });
		const simple = builder.newForm('search.simple', { title: 'Simple' });
		const extended = builder.newForm('search.extended', { title: 'Extended' });
		const filters = builder.newContainer('search.simple.filters', { config: { variant: 'small-tabs' } });
		const bibliographic = builder.newContainer('search.simple.filters.bibliographic', { title: 'Bibliographic' });
		const technical = builder.newContainer('search.simple.filters.technical', { title: 'Technical' });

		filters.addChildren(bibliographic, technical);
		simple.addChildren(filters);
		root.addChildren(simple, extended);

		expect(createInitialContainerUiStates(builder.build())).toEqual({
			search: 'search.simple',
			'search.simple': 'search.simple.filters',
			'search.simple.filters': 'search.simple.filters.bibliographic',
		});
	});
});
