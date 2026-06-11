// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import {
	annotationSelectController,
	annotationTextController,
	annotationPosController,
	createDefaultFormState,
	compileFormState,
	expertQueryController,
	filterAutocompleteController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	FormSystem,
	parallelController,
	queryBuilderController,
	restoreScopedFormState,
	withinController,
	type FieldController,
} from '@/features/form';
import { queryFragment, rawFilter } from '@/features/form/model/compile/query-artifact';
import { decodePersistObject, decodePersistSelection, encodePersistObject, joinPersistValues } from '@/features/form/model/controllers/persistence-codec';
import type { CqlQueryBuilderData, CqlQueryBuilderOptions } from '@/widgets/cql-query-builder/model';

import { TestTextField, createTestBuilder, createTestContext, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import QueryBuilderField from '@/features/form/fields/QueryBuilderField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

function createSingleTextForm() {
	const builder = createTestBuilder();
	const field = builder.newField('search.extended.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(field);
	return {
		context: createTestContext(),
		definition: builder,
		field,
		form,
	};
}

function createCanonicalFallbackFixture() {
	const builder = createTestBuilder();
	const root = builder.newContainer('search', ContainerRenderer, {
		title: 'Search',
		variant: 'tabs',
	});
	const simpleField = builder.newField('search.simple.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	const rawField = builder.newField('search.expert.cql', expertQueryController, RawCqlField, {});
	const simple = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' }).addChildren(simpleField);
	const expert = builder.newForm('search.expert', ContainerRenderer, { title: 'Expert' }).addChildren(rawField);
	root.addChildren(simple, expert);
	return {
		context: createTestContext(),
		definition: builder,
		expert,
		rawField,
		simple,
		simpleField,
	};
}

describe('scoped form persistence', () => {
	test('encodes readable f.* state and ignores unscoped unknown query parameters when restoring', () => {
		const fixture = createSingleTextForm();
		const state = createDefaultFormState(fixture.definition.getRoot(), fixture.context);
		state.state[fixture.field.id] = { value: 'water' };

		const encoded = compileFormState(fixture.form, state, fixture.context).encoded;

		expect(encoded).toEqual({
			'f.form': 'search.extended',
			'f.word': 'water',
		});

		const restored = restoreScopedFormState(
			fixture.definition,
			{
				unknown: 'not-form-owned',
				word: 'fire',
				'f.form': 'search.extended',
				'f.word': 'water',
			},
			{ patt: '[word="(?i)water"]' },
		);

		expect(restored.issues).toEqual([]);
		expect(restored.state[fixture.field.id]).toEqual({ value: 'water' });
		expect(restored.rawOverrides).toEqual({});
	});

	test('reports dangling scoped parameters and restores fields accepted by the default form for an unknown selector', () => {
		const fixture = createSingleTextForm();
		const restored = restoreScopedFormState(fixture.definition, {
			'f.form': 'removed-form',
			'f.word': 'water',
			'f.v': 'old-version',
			'f.removed': 'stale',
		});

		expect(restored.state[fixture.field.id]).toEqual({ value: 'water' });
		expect(restored.issues).toEqual([
			{ key: 'form', message: "No current form accepts persisted selector 'removed-form'." },
			{ key: 'v', message: "No current form field accepts persisted key 'v'." },
			{ key: 'removed', message: "No current form field accepts persisted key 'removed'." },
		]);
	});

	test('retains defaults when a known field restore throws', () => {
		const throwingController: FieldController<'throwing-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'throwing-text',
			restore() {
				throw new Error('Unsupported historical value.');
			},
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', throwingController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(field);

		const restored = restoreScopedFormState(builder, {
			'f.word': 'old',
		});

		expect(restored.state[field.id]).toEqual({ value: '' });
		expect(restored.issues).toEqual([{ key: 'word', nodeId: field.id, message: 'Unsupported historical value.' }]);
	});

	test('activates a raw patt override when restored form output differs from canonical patt', async () => {
		const fixture = createSingleTextForm();
		const restored = restoreScopedFormState(
			fixture.definition,
			{
				'f.form': 'extended',
				'f.word': 'water',
			},
			{ patt: '[word="(?i)fire"]' },
		);

		expect(restored.rawOverrides).toEqual({ patt: '[word="(?i)fire"]' });

		fixture.definition.state.replaceState(restored);
		const wrapper = mount(FormSystem, {
			props: {
				definition: fixture.definition,
			},
		});
		await wrapper.vm.$nextTick();

		expect(wrapper.get('.blf-raw-override code').text()).toBe('[word="(?i)fire"]');
		expect((wrapper.get('input[aria-label="Word"]').element as HTMLInputElement).disabled).toBe(true);

		await wrapper.get('.blf-raw-override button').trigger('click');

		expect(wrapper.find('.blf-raw-override').exists()).toBe(false);
		expect((wrapper.get('input[aria-label="Word"]').element as HTMLInputElement).disabled).toBe(false);
	});

	test('keeps controller warnings informational when canonical comparison succeeds', () => {
		const warningController: FieldController<'warning-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'warning-text',
			restore(payload) {
				return {
					state: { value: Array.isArray(payload) ? (payload[0] ?? '') : payload },
					warnings: ['Restored with a harmless adjustment.'],
				};
			},
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', warningController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(field);
		const definition = builder;
		const context = createTestContext();

		const restored = restoreScopedFormState(definition, { 'f.word': 'water' }, { patt: '[word="(?i)water"]' });

		expect(restored.issues).toEqual([{ key: 'word', nodeId: field.id, message: 'Restored with a harmless adjustment.' }]);
		expect(restored.rawOverrides).toEqual({});
	});

	test('uses the expert CQL field for old raw URLs that only contain canonical patt', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreScopedFormState(fixture.definition, {}, { patt: '[word="water"]' });

		expect(restored.uiState.search).toBe('search.expert');
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
	});

	test('ignores unusable scoped noise when falling back to canonical patt', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreScopedFormState(
			fixture.definition,
			{
				'f.form': 'removed-form',
				'f.tab': 'missing:child',
				'f.removed': 'stale',
			},
			{ patt: '[word="water"]' },
		);

		expect(restored.uiState.search).toBe(fixture.expert.id);
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
		expect(restored.issues.map(issue => issue.key)).toEqual(['form', 'tab', 'removed']);
	});

	test('uses valid scoped field state instead of canonical-only fallback', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreScopedFormState(fixture.definition, { 'f.word': 'water' }, { patt: '[word="fire"]' });

		expect(restored.uiState.search).toBe(fixture.simple.id);
		expect(restored.state[fixture.simpleField.id]).toEqual({ value: 'water' });
		expect(restored.state[fixture.rawField.id]).toBe('');
		expect(restored.rawOverrides).toEqual({ patt: '[word="fire"]' });
	});

	test('persists and restores query-affecting tabs with implicit filter contributions', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const newspapers = builder.newContainer('search.extended.filters.newspapers', ContainerRenderer, {
			title: 'Newspapers',
			activeQueryContribution: queryFragment(rawFilter('category("newspaper")')),
		});
		const filters = builder
			.newContainer('search.extended.filters', ContainerRenderer, {
				title: 'Filters',
				variant: 'tabs',
			})
			.addChildren(
				builder.newContainer('search.extended.filters.shared', ContainerRenderer, {
					title: 'Shared',
				}),
				newspapers,
			);
		form.addChildren(filters);
		const definition = builder;
		const context = createTestContext();
		const state = createDefaultFormState(definition.getRoot(), context);
		state.uiState[filters.id] = newspapers.id;

		const encoded = compileFormState(form, state, context).encoded;

		expect(encoded['f.tab']).toEqual(['search.extended.filters:search.extended.filters.newspapers']);

		const restored = restoreScopedFormState(definition, encoded, {
			filter: 'category("newspaper")',
		});

		expect(restored.uiState[filters.id]).toBe(newspapers.id);
		expect(restored.rawOverrides).toEqual({});
	});

	test('retains valid tab selections and reports invalid entries', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const first = builder.newContainer('search.extended.tabs.first', ContainerRenderer, {
			title: 'First',
		});
		const tabs = builder
			.newContainer('search.extended.tabs', ContainerRenderer, {
				title: 'Tabs',
				variant: 'tabs',
			})
			.addChildren(first, builder.newContainer('search.extended.tabs.second', ContainerRenderer, { title: 'Second' }));
		form.addChildren(tabs);
		const definition = builder;

		const restored = restoreScopedFormState(definition, {
			'f.tab': ['search.extended.tabs:search.extended.tabs.first', 'missing:child', 'search.extended.tabs:search.extended.tabs.removed', 'malformed'],
		});

		expect(restored.uiState[tabs.id]).toBe(first.id);
		expect(restored.issues.length).toBe(3);
		expect(restored.issues[0].message).contains('missing');
		expect(restored.issues[1].message).contains('search.extended.tabs.removed');
		expect(restored.issues[2].message).contains('malformed');
	});

	test('throws during encode when field persistence keys are duplicate or reserved', () => {
		const duplicateBuilder = createTestBuilder();
		const duplicateForm = duplicateBuilder.newForm('search.extended', ContainerRenderer, {
			title: 'Extended',
		});
		const firstDuplicateField = duplicateBuilder.newField('search.extended.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const secondDuplicateField = duplicateBuilder.newField('search.extended.lemma', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Duplicate word',
		});
		duplicateForm.addChildren(firstDuplicateField, secondDuplicateField);
		const duplicateDefinition = duplicateBuilder;
		const duplicateContext = createTestContext();
		const duplicateState = createDefaultFormState(duplicateDefinition.getRoot(), duplicateContext);
		duplicateState.state[firstDuplicateField.id] = { value: 'water' };
		duplicateState.state[secondDuplicateField.id] = { value: 'fire' };

		expect(() => compileFormState(duplicateForm, duplicateState, duplicateContext)).toThrow(/Duplicate form persistence key 'word'/);

		const reservedController: FieldController<'reserved-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'reserved-text',
			getPersistKey: () => 'form',
		};
		const builder = createTestBuilder();
		const form = builder.newForm('search.reserved', ContainerRenderer, { title: 'Reserved' });
		form.addChildren(
			builder.newField('search.reserved.word', reservedController, TestTextField, {
				annotationId: 'word',
				displayName: 'Word',
			}),
		);
		const reservedDefinition = builder;
		const reservedContext = createTestContext();

		expect(() => compileFormState(form, createDefaultFormState(reservedDefinition.getRoot(), reservedContext), reservedContext)).toThrow(/reserved form persistence key 'form'/);
	});
});

describe('controller persistence compatibility', () => {
	const context = createTestContext();
	const options = [
		{ value: 'one', label: 'One' },
		{ value: 'two', label: 'Two' },
	];
	const selectConfig = {
		kind: 'field' as const,
		id: 'field',
		displayName: 'Field',
		metadataFieldId: 'field',
		options,
	};
	const annotationConfig = {
		kind: 'field' as const,
		id: 'field',
		displayName: 'Field',
		annotationId: 'field',
		options,
	};
	const parallelConfig = {
		kind: 'field' as const,
		id: 'parallel',
		child: {
			id: 'query',
			controller: expertQueryController,
			component: RawCqlField,
			config: {},
		},
		fieldOptions: [{ id: 'contents__en' }, { id: 'contents__nl' }, { id: 'contents__de' }],
		alignByOptions: ['word-alignment'],
	};
	const queryBuilderOptions: CqlQueryBuilderOptions = {
		indexId: 'test-corpus',
		defaultAnnotationId: 'word',
		textDirection: 'ltr',
		allAnnotationsMap: {},
		annotationOptions: [],
		operatorOptions: [
			{ value: '&', label: 'AND' },
			{ value: '|', label: 'OR' },
		],
		comparatorOptions: [],
		autocomplete: async () => [],
	};
	const queryBuilderConfig = {
		kind: 'field' as const,
		id: 'querybuilder',
		options: queryBuilderOptions,
		displayName: 'Query',
	};
	const queryBuilderState: CqlQueryBuilderData = {
		tokens: [
			{
				id: 'token_original',
				properties: {
					optional: true,
					minRepeats: 1,
					maxRepeats: 3,
					beginOfSentence: true,
					endOfSentence: false,
				},
				rootAttributeGroup: {
					id: 'group_original',
					operator: '&',
					entries: [
						{
							id: 'attr_original',
							annotationId: 'word',
							comparator: '=',
							values: ['water;ship', 'literal,comma', 'literal=equals', 'literal\\slash'],
							caseSensitive: false,
							uploadedValue: 'water;ship\nliteral,comma\nliteral=equals\nliteral\\slash',
						},
						{
							id: 'group_nested',
							operator: '|',
							entries: [
								{
									id: 'attr_nested',
									annotationId: 'lemma',
									comparator: 'startsWith',
									values: ['boot'],
									caseSensitive: true,
								},
							],
						},
					],
				},
			},
		],
	};

	function stripQueryBuilderIds(value: CqlQueryBuilderData): CqlQueryBuilderData {
		return {
			tokens: value.tokens.map(token => ({
				id: '',
				properties: token.properties,
				rootAttributeGroup: stripGroupIds(token.rootAttributeGroup),
			})),
		};
	}

	function stripGroupIds(group: CqlQueryBuilderData['tokens'][number]['rootAttributeGroup']): CqlQueryBuilderData['tokens'][number]['rootAttributeGroup'] {
		return {
			id: '',
			operator: group.operator,
			entries: group.entries.map(entry => {
				if ('annotationId' in entry) {
					const { uploadedValue: _uploadedValue, ...attribute } = entry;
					return { ...attribute, id: '' };
				}
				return stripGroupIds(entry);
			}),
		};
	}

	test('shares scalar and selection representations across compatible controllers', () => {
		expect(filterSelectController.restore('one', selectConfig, context)).toEqual({
			state: ['one'],
			warnings: [],
		});
		expect(filterCheckboxController.restore('one,two', selectConfig, context)).toEqual({
			state: ['one', 'two'],
			warnings: [],
		});
		expect(annotationSelectController.restore('one,two', annotationConfig, context)).toEqual({
			state: ['one', 'two'],
			warnings: [],
		});
		expect(filterRadioController.restore('one', selectConfig, context)).toEqual({
			state: 'one',
			warnings: [],
		});
	});

	test('rejects ambiguous multiple values for single-value controllers', () => {
		expect(() => filterRadioController.restore('one,two', selectConfig, context)).toThrow(/single-choice/);
		expect(() => filterTextController.restore(['one', 'two'], selectConfig, context)).toThrow(/multiple URL values/);
		expect(() => filterAutocompleteController.restore(['one', 'two'], selectConfig, context)).toThrow(/multiple URL values/);
		expect(() => annotationTextController.restore(['one', 'two'], annotationConfig, context)).toThrow(/multiple URL values/);
	});

	test('preserves structurally valid stale options with warnings', () => {
		expect(filterSelectController.restore('one,removed', selectConfig, context)).toEqual({
			state: ['one', 'removed'],
			warnings: ['Restored values no longer present in the current options: removed.'],
		});
	});

	test('only restores ranges from their structured representation', () => {
		const rangeConfig = {
			kind: 'field' as const,
			id: 'range',
			displayName: 'Range',
			metadataFieldId: 'range',
		};
		expect(filterRangeController.restore('low=10;high=20', rangeConfig, context)).toEqual({
			low: '10',
			high: '20',
			mode: 'strict',
		});
		expect(() => filterRangeController.restore('10', rangeConfig, context)).toThrow(/incompatible persisted value/);
	});

	test('restores dates and specialized records only through supported representations', () => {
		const dateConfig = {
			kind: 'field' as const,
			id: 'date',
			displayName: 'Date',
			metadataFieldId: 'date',
			range: true,
		};

		expect(filterDateController.restore('start=2020-01-02;end=2021-03-04;mode=permissive', dateConfig, context)).toEqual({
			startDate: { y: '2020', m: '01', d: '02' },
			endDate: { y: '2021', m: '03', d: '04' },
			mode: 'permissive',
		});
		expect(() => filterDateController.restore('start=2020;mode=unknown', dateConfig, context)).toThrow(/unknown range mode/);

		expect(annotationPosController.restore('value=VERB;selected=past,plural', {} as never, context)).toEqual({
			annotationValue: 'VERB',
			selected: { past: true, plural: true },
		});
		expect(withinController.restore('element=s;attr.type=quote', {} as never, context)).toEqual({
			element: 's',
			attributes: { type: 'quote' },
		});
		expect(
			parallelController.restore(
				'source=contents;targets=translation;align=sentence',
				{
					id: 'parallel',
					child: {
						id: 'query',
						controller: expertQueryController,
						component: RawCqlField,
						config: {},
					},
					fieldOptions: [{ id: 'default' }, { id: 'translation' }],
					alignByOptions: ['word'],
				} as never,
				context,
			),
		).toEqual({
			source: 'contents',
			targets: ['translation'],
			alignBy: 'sentence',
			sourceState: '',
			targetStates: {},
		});
		expect(expertQueryController.restore('query=[word="water"];targets=[word="water"]', {} as never, context)).toBe('[word="water"]');
	});

	test('persists parallel wrapper child source and selected target payloads under namespaced keys', () => {
		const encoded = parallelController.encode(
			{
				source: 'contents__en',
				targets: ['contents__nl'],
				alignBy: 'word-alignment',
				sourceState: '[lemma="test"]',
				targetStates: {
					contents__nl: '[lemma="proef"]',
					contents__de: '[lemma="Test"]',
				},
			},
			parallelConfig,
			context,
		);

		expect(decodePersistObject(encoded!)).toEqual({
			source: 'contents__en',
			targets: 'contents__nl',
			'source.query': '[lemma="test"]',
			'target.contents__nl.query': '[lemma="proef"]',
		});
	});

	test('restores parallel wrapper child source and target payloads', () => {
		const encoded = encodePersistObject({
			source: 'contents__en',
			targets: 'contents__nl',
			align: 'word-alignment',
			'source.query': '[lemma="test"]',
			'target.contents__nl.query': '[lemma="proef"]',
		});

		expect(parallelController.restore(encoded!, parallelConfig, context)).toEqual({
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 'word-alignment',
			sourceState: '[lemma="test"]',
			targetStates: {
				contents__nl: '[lemma="proef"]',
			},
		});
	});

	test('drops unknown restored parallel target states with warnings', () => {
		const encoded = encodePersistObject({
			targets: 'contents__fr',
			'target.contents__fr.query': '[lemma="essai"]',
		});

		const restored = parallelController.restore(encoded!, parallelConfig, context);

		expect(restored).toEqual({
			state: {
				source: null,
				targets: [],
				alignBy: 'word-alignment',
				sourceState: '',
				targetStates: {},
			},
			warnings: [
				"Dropped restored target 'contents__fr' because it is no longer present in the current parallel target options.",
				"Dropped restored target state for 'contents__fr' because it is no longer present in the current parallel target options.",
			],
		});
	});

	test('round-trips escaped separators in selections and records', () => {
		const selection = ['literal,comma', 'literal;semicolon', 'literal=equals', 'literal\\slash'];
		expect(decodePersistSelection(joinPersistValues(selection))).toEqual(selection);

		const record = encodePersistObject({ value: 'a;b,c=d\\e' });
		expect(record).not.toBeNull();
		expect(decodePersistObject(record!)).toEqual({ value: 'a;b,c=d\\e' });
	});

	test('persists querybuilder state as a compact structured value and restores generated ids', () => {
		const encoded = queryBuilderController.encode(queryBuilderState, queryBuilderConfig, context);
		expect(encoded).toEqual(expect.stringContaining('v=1'));

		const restored = queryBuilderController.restore(encoded!, queryBuilderConfig, context);

		expect(stripQueryBuilderIds(restored)).toEqual(stripQueryBuilderIds(queryBuilderState));
		expect(restored.tokens[0].id).not.toBe(queryBuilderState.tokens[0].id);
	});

	test('omits default and uploaded querybuilder-only state from persistence', () => {
		const defaultState = queryBuilderController.createDefaultState(queryBuilderConfig, context);
		expect(queryBuilderController.encode(defaultState, queryBuilderConfig, context)).toBeNull();

		const encoded = queryBuilderController.encode(queryBuilderState, queryBuilderConfig, context);
		const restored = queryBuilderController.restore(encoded!, queryBuilderConfig, context);
		const restoredAttribute = restored.tokens[0].rootAttributeGroup.entries[0];

		expect('annotationId' in restoredAttribute ? restoredAttribute.uploadedValue : null).toBeUndefined();
		expect('annotationId' in restoredAttribute ? restoredAttribute.values : null).toEqual(['water;ship', 'literal,comma', 'literal=equals', 'literal\\slash']);
	});

	test('round-trips querybuilder state through the parallel wrapper child payloads', () => {
		const config = {
			...parallelConfig,
			child: {
				id: 'query',
				controller: queryBuilderController,
				component: QueryBuilderField,
				config: queryBuilderConfig,
			},
		};
		const encoded = parallelController.encode(
			{
				source: 'contents__en',
				targets: ['contents__nl'],
				alignBy: 'word-alignment',
				sourceState: queryBuilderState,
				targetStates: {
					contents__nl: queryBuilderState,
				},
			},
			config,
			context,
		);

		expect(decodePersistObject(encoded!)).toEqual(
			expect.objectContaining({
				'source.query': expect.stringContaining('v=1'),
				'target.contents__nl.query': expect.stringContaining('v=1'),
			}),
		);

		const restored = parallelController.restore(encoded!, config, context);
		const restoredState = 'state' in restored ? restored.state : restored;

		expect(stripQueryBuilderIds(restoredState.sourceState as CqlQueryBuilderData)).toEqual(stripQueryBuilderIds(queryBuilderState));
		expect(stripQueryBuilderIds(restoredState.targetStates.contents__nl as CqlQueryBuilderData)).toEqual(stripQueryBuilderIds(queryBuilderState));
	});

	test('rejects duplicate and unsupported structured record keys', () => {
		const dateConfig = {
			kind: 'field' as const,
			id: 'date',
			displayName: 'Date',
			metadataFieldId: 'date',
			range: true,
		};

		expect(() => decodePersistObject('value=one;value=two')).toThrow(/duplicate key 'value'/);
		expect(() => filterDateController.restore('start=2020;unexpected=value', dateConfig, context)).toThrow(/unsupported persisted keys: unexpected/);
	});
});
