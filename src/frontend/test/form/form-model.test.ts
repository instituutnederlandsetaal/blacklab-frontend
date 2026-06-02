import { describe, expect, test } from 'vitest';

import { buildFormQuery, createFormState, createInitialContainerUiStates, summarizeForm, type QueryCombineMode } from '@/features/form';
import { createCompiledQueryProjections } from '@/features/form/model/compile/query-artifact';

import { TestTextField, createTestBuilder, createTestContext, parentFormProbeView, testTextController } from './helpers';

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
	const form = builder.newForm('search.form', ContainerRenderer, { title: 'Search' });
	const group = form.addContainer('search.group', ContainerRenderer, { combine });
	const word = builder.newField('search.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	const lemma = builder.newField('search.lemma', testTextController, TestTextField, {
		annotationId: 'lemma',
		displayName: 'Lemma',
	});

	group.addChildren(word, lemma);

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
		const root = builder.newContainer('search', ContainerRenderer, { variant: 'tabs' });
		const sharedField = builder.newField('shared.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Shared word',
		});
		const firstForm = root.addForm('search.first', ContainerRenderer, { title: 'First' });
		const secondForm = root.addForm('search.second', ContainerRenderer, { title: 'Second' });

		firstForm.addChildren(sharedField);
		secondForm.addChildren(sharedField);

		expect(createFormState(builder.build(), createTestContext()).controllerState).toEqual({
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
		const compiled = createCompiledQueryProjections(buildFormQuery(fixture.form, fixture.state, fixture.context));
		const summaries = summarizeForm(fixture.form, fixture.state, fixture.context);

		expect(compiled).toEqual(expected.compiled);
		expect(summaries).toEqual(expected.summaries);
	});

	test('createInitialContainerUiStates picks the first active branch for nested container-like nodes', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, { variant: 'tabs' });
		const simple = root.addForm('search.simple', ContainerRenderer, { title: 'Simple' });
		root.addForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const filters = simple.addContainer('search.simple.filters', ContainerRenderer, {
			variant: 'small-tabs',
		});
		filters.addContainer('search.simple.filters.bibliographic', ContainerRenderer, {
			title: 'Bibliographic',
		});
		filters.addContainer('search.simple.filters.technical', ContainerRenderer, {
			title: 'Technical',
		});

		expect(createInitialContainerUiStates(builder.build())).toEqual({
			search: 'search.simple',
			'search.simple': 'search.simple.filters',
			'search.simple.filters': 'search.simple.filters.bibliographic',
		});
	});
});
