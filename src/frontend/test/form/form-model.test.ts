import { describe, expect, test } from 'vitest';
import { defineComponent, type PropType } from 'vue';

import { ControllerRegistry, FormBuilder, createInitialContainerUiStates, createFormState, type FieldController, type FieldControllerConfig, type FormRuntimeContext } from '@/features/form';
import { buildFormQuery, summarizeForm } from '@/features/form/model/compile';
import { createCompiledQueryProjections } from '@/features/form/model/compile/query-artifact';
import type { QueryCombineMode, FormFieldNode } from '@/features/form/model/types/form-shape';

type TextFieldState = {
	value: string;
};

type TextFieldConfig = FieldControllerConfig & {
	annotationId: string;
	label: string;
};

const DummyField = defineComponent({
	props: {
		node: {
			type: Object as PropType<FormFieldNode<TextFieldConfig>>,
			required: true,
		},
		state: {
			type: Object as PropType<TextFieldState>,
			required: true,
		},
	},
	setup: () => () => null,
});

const textController: FieldController<'test-text', TextFieldState, TextFieldConfig> = {
	kind: 'test-text',
	component: DummyField,
	createDefaultState: () => ({ value: '' }),
	buildQuery({ node, state }) {
		if (!state.value.trim()) {
			return { pattern: null, filter: null, wrappers: [], searchField: null, summaries: [] };
		}

		return {
			pattern: {
				type: 'token',
				clauses: [
					{
						type: 'equals',
						annotationId: node.config.annotationId,
						value: state.value,
					},
				],
			},
			filter: null,
			wrappers: [],
			searchField: null,
			summaries: [{ id: node.id, label: node.config.label, value: state.value }],
		};
	},
	toJSON() {
		return { kind: this.kind, version: 1 };
	},
};

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

function createRegistry() {
	const registry: ControllerRegistry = new ControllerRegistry();
	registry.registerController(textController);
	return registry;
}

function createContext(): FormRuntimeContext {
	return {
		corpus: { indexId: 'test-corpus', textDirection: 'ltr' },
	};
}

function assignState(field: FormFieldNode<TextFieldConfig>, value: string, formState: ReturnType<typeof createFormState>) {
	formState.controllerState[field.id] = { value };
}

function createCompositionFixture(combine: QueryCombineMode) {
	const registry = createRegistry();
	const builder = new FormBuilder(registry);
	const form = builder.newForm('search.form', { title: 'Search' });
	const group = builder.newContainer('search.group', { config: { combine } });
	const word = builder.newField('search.word', textController, {
		annotationId: 'word',
		label: 'Word',
	});
	const lemma = builder.newField('search.lemma', textController, {
		annotationId: 'lemma',
		label: 'Lemma',
	});

	group.addChildren(word, lemma);
	form.addChildren(group);

	const definition = builder.build();
	const context = createContext();
	const state = createFormState(definition, context);
	assignState(word, sharedStateExpectation.word.value, state);
	assignState(lemma, sharedStateExpectation.lemma.value, state);

	return {
		context,
		form,
		state,
	};
}

describe('form model composition', () => {
	test.each(compositionExpectations)('$name', ({ combine, expected }) => {
		const fixture = createCompositionFixture(combine);
		const compiled = createCompiledQueryProjections(buildFormQuery(fixture.form, fixture.state, fixture.context));
		const summaries = summarizeForm(fixture.form, fixture.state, fixture.context);

		expect(compiled).toEqual(expected.compiled);
		expect(summaries).toEqual(expected.summaries);
	});

	test('initial container ui state picks the first child container or form for each container-like node', () => {
		const registry = createRegistry();
		const builder = new FormBuilder(registry);
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
