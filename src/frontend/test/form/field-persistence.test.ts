import { describe, expect, test } from 'vitest';

import { type CqlQueryBuilderData, type CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import {
	annotationPosController,
	annotationSelectController,
	collocationController,
	createCollocationTarget,
	createFormFieldNode,
	expertQueryController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	parallelController,
	queryBuilderController,
	restoreFieldState,
	restoreForm,
	withinAttributeRangeController,
	withinController,
	type FieldController,
	type FieldControllerProps,
	type FormEmission,
	type TokenSequenceCreateField,
} from '@/features/form';
import { type CollocationFieldState } from '@/features/form/fields/collocation-field';
import { compileCql } from '@/features/form/model/compile/query-artifact';
import { type CqlPatternNode } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestContext, testTextController } from './helpers';

import CollocationField from '@/features/form/fields/CollocationField.vue';
import QueryBuilderField from '@/features/form/fields/QueryBuilderField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('collocation field persistence', () => {
	test('round-trips collocation state and rejects malformed persisted values', () => {
		const builder = createTestBuilder();
		const field = builder.newField('collocations.field', collocationController, CollocationField, {
			annotationOptions: [{ value: 'word', label: () => 'Word' }],
			queryBuilderOptions: { defaultAnnotationId: 'word', annotationOptions: [{ value: 'word', label: 'Word' }] } as CqlQueryBuilderOptions,
			createAnnotationField: ({ id, annotationId }: Parameters<TokenSequenceCreateField>[0]) => createFormFieldNode(id, testTextController, TestTextField, { annotationId, displayName: annotationId }),
			defaultAnnotation: 'word',
			defaultWithin: '',
			parsePattern: async () => null,
			withinOptions: [],
		});
		const form = builder.newForm('collocations.form', ContainerRenderer, { target: createCollocationTarget('word') }).addChildren(field);
		const codecContext = { config: field, runtime: builder.context };
		const defaults = collocationController.createDefaultState(field, builder.context);
		const collocationState = {
			...defaults,
			keyword: { ...defaults.keyword, mode: 'expert' as const, expert: '[word="ship"]' },
		};
		const encoded = collocationController.persistence.codec.encode(collocationState, codecContext)!;

		expect(encoded).toMatch(/^q=/);
		expect(collocationController.persistence.codec.decode(encoded, codecContext)).toMatchObject({
			keyword: { mode: 'expert', expert: '[word="ship"]' },
			collocate: { enabled: false },
			before: 5,
			after: 5,
		});

		const restored = restoreForm(builder, { 'f.form': form.id, 'f.collocations': encoded.replace('m=e', 'm=invalid') });
		expect(collocationController.persistence.codec.encode(restored.state.state[field.id] as CollocationFieldState, codecContext)).toBeNull();
		expect(restored.state.issues).toContainEqual({
			severity: 'error',
			message: "Could not restore persisted field 'collocations' for 'collocations.field': Cannot decode unmapped value 'invalid'.",
		});

		const unavailable = restoreForm(builder, { 'f.form': form.id, 'f.collocations': 'a=removed' });
		expect(collocationController.persistence.codec.encode(unavailable.state.state[field.id] as CollocationFieldState, codecContext)).toBeNull();
		expect(unavailable.state.issues).toContainEqual({
			severity: 'error',
			message: "Could not restore persisted field 'collocations' for 'collocations.field': Cannot restore collocation grouping annotation 'removed' because it is not available.",
		});
	});
});

describe('field controller persistence', () => {
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
		childFieldTemplate: createFormFieldNode('parallel.query', expertQueryController, RawCqlField, {}),
		fieldOptions: [{ id: 'contents__en' }, { id: 'contents__nl' }, { id: 'contents__de' }],
		alignByOptions: ['word-alignment'],
	};

	const queryBuilderOptions: CqlQueryBuilderOptions = {
		indexId: 'test-corpus',
		defaultAnnotationId: 'word',
		textDirection: 'ltr',
		allAnnotationsMap: {},
		annotationOptions: [
			{ value: 'word', label: 'Word' },
			{ value: 'lemma', label: 'Lemma' },
		],
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
							values: ['water;ship', 'literal,comma', 'literal=equals', 'literal\\slash', 'literal{brace}'],
							caseSensitive: false,
							uploadedValue: 'ui-only-root-upload',
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
									uploadedValue: 'ui-only-nested-upload',
								},
							],
						},
					],
				},
			},
		],
	};

	function repeatState(minRepeats: number, maxRepeats: number, optional = false): CqlQueryBuilderData {
		return {
			tokens: [
				{
					id: 'repeat_token',
					properties: { optional, minRepeats, maxRepeats, beginOfSentence: false, endOfSentence: false },
					rootAttributeGroup: {
						id: 'repeat_group',
						operator: '&',
						entries: [{ id: 'repeat_attribute', annotationId: 'word', comparator: '=', values: ['water'], caseSensitive: false }],
					},
				},
			],
		};
	}

	function compileQueryBuilderState(state: CqlQueryBuilderData): string | null {
		const emissions: FormEmission[] = [];
		queryBuilderController.collect(queryBuilderConfig, context, state, (name, value) => emissions.push({ name, value } as FormEmission));
		const pattern = emissions.find(emission => emission.name === 'patt')?.value as CqlPatternNode | undefined;
		return pattern ? compileCql(pattern) : null;
	}

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

	function containsQueryBuilderUiState(group: CqlQueryBuilderData['tokens'][number]['rootAttributeGroup']): boolean {
		return group.entries.some(entry => ('annotationId' in entry ? Object.hasOwn(entry, 'uploadedValue') : containsQueryBuilderUiState(entry)));
	}

	const encode = <Kind extends string, State, Extra>(controller: FieldController<Kind, State, Extra>, state: State, config: FieldControllerProps<Extra>) =>
		controller.persistence.codec.encode(state, { config, runtime: context });

	const restore = <Kind extends string, State, Extra>(controller: FieldController<Kind, State, Extra>, payload: string | string[], config: FieldControllerProps<Extra>): State =>
		restoreFieldState({ ...config, controller }, payload, context) as State;

	test('filter-select persistence restores one selected option', () => {
		expect(restore(filterSelectController, 'one', selectConfig)).toEqual(['one']);
	});

	test('filter-checkbox persistence restores comma-separated options', () => {
		expect(restore(filterCheckboxController, 'one,two', selectConfig)).toEqual(['one', 'two']);
	});

	test('annotation-select persistence restores comma-separated options', () => {
		expect(restore(annotationSelectController, 'one,two', annotationConfig)).toEqual(['one', 'two']);
	});

	test('filter-radio persistence restores one scalar option', () => {
		expect(restore(filterRadioController, 'one', selectConfig)).toBe('one');
	});

	test('filter-select persistence rejects unavailable options', () => {
		expect(() => restore(filterSelectController, 'one,removed', selectConfig)).toThrow('Cannot restore values no longer present in the current options: removed.');
	});

	test('filter-radio persistence rejects repeated query values', () => {
		expect(() => restore(filterRadioController, ['one', 'two'], selectConfig)).toThrow('Cannot restore field persistence from multiple URL values.');
	});

	test('range persistence decodes compact bounds', () => {
		const rangeConfig = { kind: 'field' as const, id: 'range', displayName: 'Range', metadataFieldId: 'range' };
		expect(restore(filterRangeController, 'l=10;h=20', rangeConfig)).toEqual({ low: '10', high: '20', mode: 'strict' });
	});

	test('shared range persistence resolves configured modes per field', () => {
		const metadataConfig = { kind: 'field' as const, id: 'metadata-range', displayName: 'Range', metadataFieldId: 'range', mode: 'permissive' as const };
		const withinConfig = { kind: 'field' as const, id: 'within-range', displayName: 'Range', elementName: 's', attributeName: 'length', mode: 'permissive' as const };
		const state = { low: '10', high: '', mode: 'permissive' as const };

		expect(encode(filterRangeController, state, metadataConfig)).toBe('l=10');
		expect(restore(filterRangeController, 'l=10', metadataConfig)).toEqual(state);
		expect(encode(withinAttributeRangeController, state, withinConfig)).toBe('l=10');
		expect(restore(withinAttributeRangeController, 'l=10', withinConfig)).toEqual(state);
		expect(restore(filterRangeController, 'l=10', { ...metadataConfig, mode: 'strict' })).toEqual({ ...state, mode: 'strict' });
	});

	test('range persistence rejects an unstructured scalar', () => {
		const rangeConfig = { kind: 'field' as const, id: 'range', displayName: 'Range', metadataFieldId: 'range' };
		expect(() => restore(filterRangeController, '10', rangeConfig)).toThrow('Object contains an unsupported root value.');
	});

	test('date persistence decodes compact structured state', () => {
		const dateConfig = { kind: 'field' as const, id: 'date', displayName: 'Date', metadataFieldId: 'date', range: true };
		expect(restore(filterDateController, 's=2020-01-02;e=2021-03-04;m=p', dateConfig)).toEqual({
			startDate: { y: '2020', m: '01', d: '02' },
			endDate: { y: '2021', m: '03', d: '04' },
			mode: 'permissive',
		});
	});

	test('date persistence rejects unsupported modes', () => {
		const dateConfig = { kind: 'field' as const, id: 'date', displayName: 'Date', metadataFieldId: 'date', range: true };
		expect(() => restore(filterDateController, 's=2020;m=unknown', dateConfig)).toThrow("Cannot decode unmapped value 'unknown'.");
	});

	test('date persistence rejects malformed dates', () => {
		const dateConfig = { kind: 'field' as const, id: 'date', displayName: 'Date', metadataFieldId: 'date', range: true };
		expect(() => restore(filterDateController, 's=2020-01-02-extra', dateConfig)).toThrow("Cannot restore date value '2020-01-02-extra' with more than three components.");
	});

	test('part-of-speech persistence round-trips subannotation selections', () => {
		const posState = { pos: ['VERB'], number: ['singular', 'plural'] };
		expect(encode(annotationPosController, posState, {} as never)).toBe('pos:{VERB};number:{singular,plural}');
		expect(restore(annotationPosController, 'pos:{VERB};number:{singular,plural}', {} as never)).toEqual(posState);
	});

	test('within persistence decodes a configured element and attribute', () => {
		const withinConfig = {
			kind: 'field' as const,
			id: 'within',
			options: [{ value: 's', label: 'Sentence', attributes: [{ value: 'type', label: 'Type' }] }],
		};
		expect(restore(withinController, 'e=s;a={type:quote}', withinConfig)).toEqual({ element: 's', attributes: { type: 'quote' } });
	});

	test('within persistence rejects unavailable elements', () => {
		const withinConfig = {
			kind: 'field' as const,
			id: 'within',
			options: [{ value: 's', label: 'Sentence', attributes: [{ value: 'type', label: 'Type' }] }],
		};
		expect(() => restore(withinController, 'e=removed', withinConfig)).toThrow("Cannot restore within element 'removed' because it is not available in the current form.");
	});

	test('within persistence rejects unavailable attributes', () => {
		const withinConfig = {
			kind: 'field' as const,
			id: 'within',
			options: [{ value: 's', label: 'Sentence', attributes: [{ value: 'type', label: 'Type' }] }],
		};
		expect(() => restore(withinController, 'e=s;a={removed:value}', withinConfig)).toThrow("Cannot restore within attribute 'removed' because it is not available for element 's'.");
	});

	test('query-builder persistence restores semantic state with fresh ids and no uploaded UI values', () => {
		const encoded = encode(queryBuilderController, queryBuilderState, queryBuilderConfig);
		expect(encoded).toContain('v=2');
		const restored = restore(queryBuilderController, encoded!, queryBuilderConfig) as CqlQueryBuilderData;
		expect(stripQueryBuilderIds(restored)).toEqual(stripQueryBuilderIds(queryBuilderState));
		expect(restored.tokens[0].id).not.toBe(queryBuilderState.tokens[0].id);
		expect(restored.tokens[0].rootAttributeGroup.id).not.toBe(queryBuilderState.tokens[0].rootAttributeGroup.id);
		expect(encoded).not.toContain('ui-only-root-upload');
		expect(encoded).not.toContain('ui-only-nested-upload');
		expect(containsQueryBuilderUiState(restored.tokens[0].rootAttributeGroup)).toBe(false);
	});

	test.each([
		{ name: 'default', min: 1, max: 1, optional: false, cql: '[word="water"]' },
		{ name: 'exact', min: 2, max: 2, optional: false, cql: '[word="water"]{2}' },
		{ name: 'finite range', min: 2, max: 4, optional: false, cql: '[word="water"]{2,4}' },
		{ name: 'open minimum', min: Number.NaN, max: 4, optional: false, cql: '[word="water"]{,4}' },
		{ name: 'open maximum', min: 2, max: Number.NaN, optional: false, cql: '[word="water"]{2,}' },
		{ name: 'both open', min: Number.NaN, max: Number.NaN, optional: false, cql: '[word="water"]' },
		{ name: 'optional open', min: Number.NaN, max: Number.NaN, optional: true, cql: '[word="water"]?' },
		{ name: 'optional finite', min: 2, max: 4, optional: true, cql: '[word="water"]{2,4}?' },
	])('round-trips $name repeat bounds and CQL', ({ min, max, optional, cql }) => {
		const state = repeatState(min, max, optional);
		const encoded = encode(queryBuilderController, state, queryBuilderConfig)!;
		const restored = restore(queryBuilderController, encoded, queryBuilderConfig) as CqlQueryBuilderData;
		const restoredProperties = restored.tokens[0].properties;

		expect(compileQueryBuilderState(restored)).toBe(cql);
		expect(Object.is(restoredProperties.minRepeats, min)).toBe(true);
		expect(Object.is(restoredProperties.maxRepeats, max)).toBe(true);
		expect(encoded.includes('n=-1')).toBe(Number.isNaN(min));
		expect(encoded.includes('x=-1')).toBe(Number.isNaN(max));
	});

	test('query-builder restoration rejects annotations removed from the current form', () => {
		const encoded = encode(queryBuilderController, queryBuilderState, queryBuilderConfig);
		const currentConfig = {
			...queryBuilderConfig,
			options: { ...queryBuilderConfig.options, defaultAnnotationId: 'lemma', annotationOptions: [{ value: 'lemma', label: 'Lemma' }] },
		};
		expect(() => restore(queryBuilderController, encoded!, currentConfig)).toThrow("Cannot restore querybuilder annotation 'word' because it is not available in the current form.");
	});

	test.each([
		{ persistedMaximum: '-2', expected: 'Querybuilder repeat maximum must be a non-negative integer.' },
		{ persistedMaximum: '1.5', expected: 'Querybuilder repeat maximum must be a non-negative integer.' },
		{ persistedMaximum: '0', expected: 'Querybuilder repeat minimum cannot exceed its maximum.' },
	])('query-builder restoration rejects repeat maximum $persistedMaximum', ({ persistedMaximum, expected }) => {
		const encoded = encode(queryBuilderController, queryBuilderState, queryBuilderConfig)!;

		expect(() => restore(queryBuilderController, encoded.replace('x=3', `x=${persistedMaximum}`), queryBuilderConfig)).toThrow(expected);
	});

	test.each([
		{ min: -1, max: 2, bound: 'minimum' },
		{ min: 0, max: -1, bound: 'maximum' },
	])('query-builder persistence rejects a negative runtime $bound', ({ min, max, bound }) => {
		expect(() => encode(queryBuilderController, repeatState(min, max), queryBuilderConfig)).toThrow(`Querybuilder repeat ${bound} must be a non-negative integer.`);
	});

	test('query-builder persistence omits its default state', () => {
		expect(encode(queryBuilderController, queryBuilderController.createDefaultState(queryBuilderConfig, context), queryBuilderConfig)).toBeNull();
	});

	test('round-trips querybuilder state through parallel child payloads', () => {
		const config = {
			...parallelConfig,
			childFieldTemplate: createFormFieldNode('parallel.querybuilder', queryBuilderController, QueryBuilderField, {
				displayName: queryBuilderConfig.displayName,
				options: queryBuilderConfig.options,
			}),
		};
		const defaultTargetState = queryBuilderController.createDefaultState(queryBuilderConfig, context);
		const encoded = encode(
			parallelController,
			{
				source: 'contents__en',
				targets: ['contents__nl'],
				alignBy: 'word-alignment',
				childStates: { contents__en: queryBuilderState, contents__nl: defaultTargetState },
			},
			config,
		);
		expect(encoded).toBe(
			encode(
				parallelController,
				{
					source: 'contents__en',
					targets: ['contents__nl'],
					alignBy: 'word-alignment',
					childStates: { contents__en: queryBuilderState },
				},
				config,
			),
		);
		const restored = restore(parallelController, encoded!, config) as { childStates: Record<string, CqlQueryBuilderData> };
		expect(stripQueryBuilderIds(restored.childStates.contents__en)).toEqual(stripQueryBuilderIds(queryBuilderState));
		expect(stripQueryBuilderIds(restored.childStates.contents__nl)).toEqual(stripQueryBuilderIds(defaultTargetState));
	});

	test('date persistence rejects unsupported structured keys', () => {
		const dateConfig = {
			kind: 'field' as const,
			id: 'date',
			displayName: 'Date',
			metadataFieldId: 'date',
			range: true,
		};

		expect(() => restore(filterDateController, 's=2020;unexpected=value', dateConfig)).toThrow("Unsupported object key 'unexpected'.");
	});
});
