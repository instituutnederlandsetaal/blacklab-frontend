// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';

import type { CqlQueryBuilderData, CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import {
	annotationSelectController,
	annotationPosController,
	createDefaultFormState,
	createFormFieldNode,
	compileFormNode,
	encodeControllerState,
	expertQueryController,
	filterCheckboxController,
	filterDateController,
	filterRadioController,
	filterRangeController,
	filterSelectController,
	filterTextController,
	FormSystem,
	parallelController,
	queryBuilderController,
	resultGroupByController,
	resultGroupDisplayModeController,
	resultSortController,
	resultViewedResultsController,
	restoreControllerState,
	restoreFormState,
	array,
	bool,
	object,
	record,
	scalar,
	withinController,
	type FieldController,
	type FieldControllerProps,
} from '@/features/form';
import { filter, queryFragment } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestContext, createTestRuntime, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
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
		definition: builder,
		runtime: createTestRuntime(builder),
		field,
		form,
	};
}

function createCanonicalFallbackFixture(isParallelCorpus?: boolean) {
	const context = createTestContext();
	const builder = createTestBuilder({
		...context,
		corpus: { ...context.corpus, isParallelCorpus },
	});
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
		definition: builder,
		expert,
		rawField,
		simple,
		simpleField,
	};
}

describe('scoped form persistence', () => {
	test('passes a field query contribution result preset into the compiled submission snapshot', () => {
		const builder = createTestBuilder();
		const resultPresetController: FieldController<'result-preset-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'result-preset-text',
			getQueryContribution: (_config, _runtime, state) =>
				queryFragment({
					resultPreset: {
						viewedResults: 'docs',
						groupBy: [state.value],
						groupDisplayMode: 'table',
						sort: null,
					},
				}),
		};
		const field = builder.newField('explore.corpora.options', resultPresetController, TestTextField, {
			annotationId: 'word',
			displayName: 'Options',
		});
		const form = builder.newForm('explore.corpora', ContainerRenderer, {}).addChildren(field);
		const state = createDefaultFormState(builder.context, builder.getRoot());
		state.state[field.id] = { value: 'field:date' };

		const compiled = compileFormNode(form, state, builder.context);

		expect(compiled.resultPreset).toEqual({
			viewedResults: 'docs',
			groupBy: ['field:date'],
			groupDisplayMode: 'table',
			sort: null,
		});
		(state.state[field.id] as TestTextFieldState).value = 'field:author';
		expect(compiled.resultPreset?.groupBy).toEqual(['field:date']);
	});

	test('combines result-preset field query contributions', () => {
		const builder = createTestBuilder();
		const createResultField = (
			id: string,
			controller: typeof resultViewedResultsController | typeof resultGroupByController | typeof resultSortController | typeof resultGroupDisplayModeController,
			defaultValue: string,
		) =>
			builder.newField(id, controller, SelectField, {
				displayName: id,
				options: [],
				defaultValue,
				persistKey: id,
			});
		const viewedResults = createResultField('preset.view', resultViewedResultsController, 'docs');
		const groupBy = createResultField('preset.group', resultGroupByController, 'field:date');
		const displayMode = createResultField('preset.display', resultGroupDisplayModeController, 'tokens');
		const sort = createResultField('preset.sort', resultSortController, 'field:title');
		const form = builder.newForm('explore.corpora', ContainerRenderer, {}).addChildren(viewedResults, groupBy, displayMode, sort);
		const state = createDefaultFormState(builder.context, builder.getRoot());

		const compiled = compileFormNode(form, state, builder.context);

		expect(compiled.resultPreset).toEqual({
			viewedResults: 'docs',
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: 'field:title',
		});
		expect(compiled.issues).toBeUndefined();
	});

	test('restores directly from a null-prototype raw query object', () => {
		const fixture = createSingleTextForm();
		const query = Object.assign(Object.create(null), { 'f.form': 'search.extended' }) as Record<string, unknown>;

		expect(restoreFormState(fixture.definition, query).submittedFormId).toBe('search.extended');
	});

	test('ignores inherited scoped parameters', () => {
		const fixture = createSingleTextForm();
		const query = Object.create({ 'f.form': 'search.extended' }) as Record<string, unknown>;

		expect(restoreFormState(fixture.definition, query).submittedFormId).toBeNull();
	});

	test('encodes readable f.* state and ignores unscoped unknown query parameters when restoring', () => {
		const fixture = createSingleTextForm();
		const state = createDefaultFormState(fixture.definition.context, fixture.definition.getRoot());
		state.state[fixture.field.id] = { value: 'water' };

		const encoded = compileFormNode(fixture.form, state, fixture.definition.context).encoded;

		expect(encoded).toEqual({
			'f.form': 'search.extended',
			'f.word': 'water',
		});

		const restored = restoreFormState(fixture.definition, {
			unknown: 'not-form-owned',
			word: 'fire',
			'f.form': 'search.extended',
			'f.word': 'water',
			patt: '[word="water"]',
		});

		expect(restored.issues).toEqual([]);
		expect(restored.state[fixture.field.id]).toEqual({ value: 'water' });
		expect(restored.rawOverrides).toEqual({});
		expect(Object.isFrozen(restored)).toBe(true);
		expect(Object.isFrozen(restored.state)).toBe(true);
		expect(Object.isFrozen(restored.state[fixture.field.id])).toBe(true);

		fixture.runtime.state.replaceState(restored);
		(fixture.runtime.state.state.value[fixture.field.id] as { value: string }).value = 'fire';
		expect(restored.state[fixture.field.id]).toEqual({ value: 'water' });
	});

	test('reports dangling scoped parameters and restores fields accepted by the default form for an unknown selector', () => {
		const fixture = createSingleTextForm();
		const restored = restoreFormState(fixture.definition, {
			'f.form': 'removed-form',
			'f.word': 'water',
			'f.v': 'old-version',
			'f.removed': 'stale',
		});

		expect(restored.state[fixture.field.id]).toEqual({ value: 'water' });
		expect(restored.issues).toMatchObject([{ key: 'form' }, { key: 'v' }, { key: 'removed' }]);
	});

	test('retains defaults when a known field restore throws', () => {
		const throwingController: FieldController<'throwing-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'throwing-text',
			persistence: {
				...testTextController.persistence,
				codec: testTextController.persistence.codec.refine(() => {
					throw new Error('Unsupported historical value.');
				}),
			},
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', throwingController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(field);

		const restored = restoreFormState(builder, { 'f.word': 'old' });

		expect(restored.state[field.id]).toEqual({ value: '' });
		expect(restored.issues).toMatchObject([{ key: 'word', nodeId: field.id }]);
	});

	test('reports a present scoped field without a decodable value', () => {
		const fixture = createSingleTextForm();

		const restored = restoreFormState(fixture.definition, { 'f.word': null });

		expect(restored.state[fixture.field.id]).toEqual({ value: '' });
		expect(restored.issues).toMatchObject([{ key: 'word', nodeId: fixture.field.id }]);
	});

	test('creates controller defaults before decoding persisted values', () => {
		const calls: string[] = [];
		const controller: FieldController<'ordered-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'ordered-text',
			createDefaultState: () => {
				calls.push('default');
				return { value: '' };
			},
			persistence: {
				...testTextController.persistence,
				codec: testTextController.persistence.codec.transform({
					encode: value => value,
					decode: value => {
						calls.push('restore');
						return value;
					},
				}),
			},
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', controller, TestTextField, { annotationId: 'word', displayName: 'Word' });
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(field);

		restoreFormState(builder, { 'f.word': 'water' });

		expect(calls).toEqual(['default', 'restore']);
	});

	test('activates a raw patt override when restored form output differs from canonical patt', async () => {
		const fixture = createSingleTextForm();
		const restored = restoreFormState(fixture.definition, {
			'f.form': 'extended',
			'f.word': 'water',
			patt: '[word="(?i)fire"]',
		});

		expect(restored.rawOverrides).toEqual({ patt: '[word="(?i)fire"]' });

		fixture.runtime.state.replaceState(restored);
		const wrapper = mount(FormSystem, {
			props: {
				runtime: fixture.runtime,
			},
		});
		await wrapper.vm.$nextTick();

		expect(wrapper.get('.blf-raw-override code').text()).toBe('[word="(?i)fire"]');
		expect((wrapper.get('input[aria-label="Word"]').element as HTMLInputElement).disabled).toBe(true);

		await wrapper.get('.blf-raw-override button').trigger('click');

		expect(wrapper.find('.blf-raw-override').exists()).toBe(false);
		expect((wrapper.get('input[aria-label="Word"]').element as HTMLInputElement).disabled).toBe(false);
	});

	test('continues restoring other fields after one controller rejects its payload', () => {
		const rejectingController: FieldController<'rejecting-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'rejecting-text',
			persistence: {
				...testTextController.persistence,
				codec: testTextController.persistence.codec.refine(() => {
					throw new Error('Invalid word state.');
				}),
			},
		};
		const builder = createTestBuilder();
		const word = builder.newField('search.extended.word', rejectingController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const author = builder.newField('search.extended.author', filterTextController, TextField, {
			displayName: 'Author',
			metadataFieldId: 'author',
		});
		builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(word, author);
		const restored = restoreFormState(builder, {
			'f.form': 'search.extended',
			'f.word': 'water',
			'f.author': 'Austen',
			filter: 'author:(Austen)',
			patt: '[word="(?i)water"]',
		});

		expect(restored.issues).toMatchObject([{ key: 'word', nodeId: word.id }]);
		expect(restored.state[author.id]).toEqual({ value: 'Austen', caseSensitive: false });
		expect(restored.rawOverrides).toEqual({ patt: '[word="(?i)water"]' });
	});

	test('uses the expert CQL field for old raw URLs that only contain canonical patt', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, { patt: '[word="water"]' });

		expect(restored.submittedFormId).toBeNull();
		expect(restored.uiState.search).toBe('search.expert');
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
	});

	test('ignores unusable scoped noise when falling back to canonical patt', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, {
			'f.form': 'removed-form',
			'f.tab': 'missing:child',
			'f.removed': 'stale',
			patt: '[word="water"]',
		});

		expect(restored.submittedFormId).toBeNull();
		expect(restored.uiState.search).toBe(fixture.expert.id);
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
		expect(restored.issues.map(issue => issue.key)).toEqual(['form', 'tab', 'removed']);
	});

	test('does not treat a form selector by itself as restorable query state', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, { 'f.form': fixture.simple.id, patt: '[word="water"]' });

		expect(restored.submittedFormId).toBeNull();
		expect(restored.uiState.search).toBe(fixture.expert.id);
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
		expect(restored.issues).toEqual([]);
	});

	test('uses valid scoped field state instead of canonical-only fallback', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, { 'f.word': 'water', patt: '[word="fire"]' });

		expect(restored.submittedFormId).toBeNull();
		expect(restored.uiState.search).toBe(fixture.simple.id);
		expect(restored.state[fixture.simpleField.id]).toEqual({ value: 'water' });
		expect(restored.state[fixture.rawField.id]).toBe('');
		expect(restored.rawOverrides).toEqual({ patt: '[word="fire"]' });
	});

	test('decodes canonical and scoped parameters from the same raw query', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, { 'f.form': fixture.simple.id, 'f.word': 'water', patt: '[word="fire"]' });

		expect(restored.submittedFormId).toBe(fixture.simple.id);
		expect(restored.state[fixture.simpleField.id]).toEqual({ value: 'water' });
		expect(restored.rawOverrides).toEqual({ patt: '[word="fire"]' });
		expect(compileFormNode(fixture.simple, restored, fixture.definition.context).patt).toBe('[word="fire"]');
	});

	test('decodes canonical aliases and repeated values inside restoration', () => {
		const fixture = createCanonicalFallbackFixture(true);
		const restored = restoreFormState(fixture.definition, {
			query: ['', '[word="water"]'],
			filter: ['', 'author:me'],
			searchfield: '',
			searchField: 'contents__nl',
		});

		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({ filter: 'author:me', searchfield: 'contents__nl' });
	});

	test('ignores canonical searchfield for a non-parallel form definition', () => {
		const fixture = createCanonicalFallbackFixture(false);
		const restored = restoreFormState(fixture.definition, { patt: '[word="water"]', searchfield: 'contents__nl' });

		expect(restored.rawOverrides).toEqual({});
	});

	test('persists and restores query-affecting tabs with implicit filter contributions', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const newspapers = builder.newContainer('search.extended.filters.newspapers', ContainerRenderer, {
			title: 'Newspapers',
			activeQueryContribution: queryFragment(filter('category', 'literal', 'newspaper'))!,
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
		const state = createDefaultFormState(context, definition.getRoot());
		state.uiState[filters.id] = newspapers.id;

		const encoded = compileFormNode(form, state, context).encoded;

		expect(encoded['f.tab']).toEqual(['search.extended.filters:search.extended.filters.newspapers']);

		const restored = restoreFormState(definition, { ...encoded, filter: 'category:(newspaper)' });

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

		const restored = restoreFormState(definition, {
			'f.tab': ['search.extended.tabs:search.extended.tabs.first', 'missing:child', 'search.extended.tabs:search.extended.tabs.removed', 'malformed'],
		});

		expect(restored.uiState[tabs.id]).toBe(first.id);
		expect(restored.issues.length).toBe(3);
		expect(restored.issues[0].message).contains('missing');
		expect(restored.issues[1].message).contains('search.extended.tabs.removed');
		expect(restored.issues[2].message).contains('malformed');
	});

	test('activates the path to a persisted field even when its restored value equals its default', () => {
		const defaultTextController: FieldController<'default-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'default-text',
			createDefaultState: () => ({ value: 'water' }),
		};
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const first = builder.newContainer('search.extended.tabs.first', ContainerRenderer, { title: 'First' });
		const second = builder.newContainer('search.extended.tabs.second', ContainerRenderer, { title: 'Second' }).addChildren(
			builder.newField('search.extended.tabs.second.word', defaultTextController, TestTextField, {
				annotationId: 'word',
				displayName: 'Word',
			}),
		);
		const tabs = builder.newContainer('search.extended.tabs', ContainerRenderer, { title: 'Tabs', variant: 'tabs' }).addChildren(first, second);
		form.addChildren(tabs);

		const restored = restoreFormState(builder, { 'f.word': 'water' });

		expect(restored.uiState[tabs.id]).toBe(second.id);
	});

	test('gives an explicit persisted tab selection priority over fields on other tabs', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' });
		const first = builder.newContainer('search.extended.tabs.first', ContainerRenderer, { title: 'First' });
		const second = builder.newContainer('search.extended.tabs.second', ContainerRenderer, { title: 'Second' }).addChildren(
			builder.newField('search.extended.tabs.second.word', testTextController, TestTextField, {
				annotationId: 'word',
				displayName: 'Word',
			}),
		);
		const tabs = builder.newContainer('search.extended.tabs', ContainerRenderer, { title: 'Tabs', variant: 'tabs' }).addChildren(first, second);
		form.addChildren(tabs);

		const restored = restoreFormState(builder, { 'f.word': 'water', 'f.tab': `${tabs.id}:${first.id}` });

		expect(restored.uiState[tabs.id]).toBe(first.id);
	});

	test('activates persisted fields in forms outside the canonical root graph', () => {
		const builder = createTestBuilder();
		builder.newForm('search.first', ContainerRenderer, { title: 'First' });
		const secondForm = builder.newForm('search.second', ContainerRenderer, { title: 'Second' });
		const first = builder.newContainer('search.second.tabs.first', ContainerRenderer, { title: 'First' });
		const second = builder.newContainer('search.second.tabs.second', ContainerRenderer, { title: 'Second' }).addChildren(
			builder.newField('search.second.tabs.second.word', testTextController, TestTextField, {
				annotationId: 'word',
				displayName: 'Word',
			}),
		);
		const tabs = builder.newContainer('search.second.tabs', ContainerRenderer, { title: 'Tabs', variant: 'tabs' }).addChildren(first, second);
		secondForm.addChildren(tabs);

		const restored = restoreFormState(builder, { 'f.form': secondForm.id, 'f.word': 'water' });

		expect(restored.uiState[tabs.id]).toBe(second.id);
	});

	test('raises issues during encode when field persistence keys are duplicate or reserved', () => {
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
		const duplicateState = createDefaultFormState(duplicateContext, duplicateDefinition.getRoot());
		duplicateState.state[firstDuplicateField.id] = { value: 'water' };
		duplicateState.state[secondDuplicateField.id] = { value: 'fire' };

		expect(compileFormNode(duplicateForm, duplicateState, duplicateContext).issues?.length ?? 0).toBeGreaterThanOrEqual(1);

		const reservedController: FieldController<'reserved-persistence-key', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'reserved-persistence-key',
			persistence: { ...testTextController.persistence, key: () => 'form' },
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

		expect(compileFormNode(form, createDefaultFormState(reservedContext, reservedDefinition.getRoot()), reservedContext).issues?.length ?? 0).toBeGreaterThanOrEqual(1);
	});
});

describe('controller persistence codecs', () => {
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
							values: ['water;ship', 'literal,comma', 'literal=equals', 'literal\\slash', 'literal{brace}'],
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

	const encode = <Kind extends string, State, Extra>(controller: FieldController<Kind, State, Extra>, state: State, config: FieldControllerProps<Extra>) =>
		encodeControllerState(controller, state, config, context);
	const restore = <Kind extends string, State, Extra>(controller: FieldController<Kind, State, Extra>, payload: string | string[], config: FieldControllerProps<Extra>) =>
		restoreControllerState(controller, payload, config, context);

	test('composes scoped objects, records, mappings, defaults, and escaped values', () => {
		const codec = object({
			value: scalar().default('').atRoot(),
			caseSensitive: bool().default(false).at('c'),
			values: record(scalar()).default({}).at('v'),
		}).scoped('r');
		const state = { value: '', caseSensitive: true, values: { a: 'b', c: 'd;e', escaped: 'x\\y' } };
		const encoded = codec.encode(state, undefined);

		expect(encoded).toBe('r.c=1;r.v={a:b;c:d\\;e;escaped:x\\\\y}');
		expect(codec.decode(encoded, undefined)).toEqual(state);
		expect(scalar().mapped({ strict: 's', permissive: 'p' }).decode('p', undefined)).toBe('permissive');
		expect(() => scalar().mapped({ one: 'x', two: 'x' })).throws();
		const keyCodec = record(scalar()).mapKeys({ firstName: 'f', lastName: 'l' });
		expect(keyCodec.encode({ firstName: 'Ada', lastName: 'Lovelace' }, undefined)).toBe('f:Ada;l:Lovelace');
		expect(keyCodec.decode('f:Ada;l:Lovelace', undefined)).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
		expect(() => keyCodec.decode('unknown:value', undefined)).throws();
	});

	test('supports rest properties, cloned defaults, custom omission, and strict object errors', () => {
		const codec = object({ known: scalar().default('').at('k') }).restProperties(scalar());
		expect(codec.decode('k=yes;extra=value', undefined)).toEqual({ known: 'yes', extra: 'value' });
		const unusualKeys = Object.fromEntries([
			['known', 'yes'],
			['semi;key', 'semicolon'],
			['brace{key}', 'braces'],
			['equals=key', 'equals'],
			['slash\\key', 'slash'],
			['__proto__', 'prototype'],
		]) as { known: string } & Record<string, string>;
		const unusualPayload = codec.encode(unusualKeys, undefined);
		const restoredUnusualKeys = codec.decode(unusualPayload, undefined);
		expect(restoredUnusualKeys).toEqual(unusualKeys);
		expect(Object.getPrototypeOf(restoredUnusualKeys)).toBe(Object.prototype);
		expect(Object.hasOwn(restoredUnusualKeys, '__proto__')).toBe(true);
		const scopedRestCodec = object({ known: scalar().default('').at('k') })
			.restProperties(scalar())
			.scoped('r');
		expect(scopedRestCodec.decode(scopedRestCodec.encode(unusualKeys, undefined), undefined)).toEqual(unusualKeys);
		expect(() => codec.encode({ known: 'yes', k: 'collision' }, undefined)).throws();
		expect(() => codec.decode('k=yes;known=collision', undefined)).throws();

		const prototypeRecord = Object.fromEntries([['__proto__', 'value']]);
		const restoredPrototypeRecord = record(scalar()).decode(record(scalar()).encode(prototypeRecord, undefined), undefined);
		expect(restoredPrototypeRecord).toEqual(prototypeRecord);
		expect(Object.getPrototypeOf(restoredPrototypeRecord)).toBe(Object.prototype);
		expect(Object.hasOwn(restoredPrototypeRecord, '__proto__')).toBe(true);

		const defaultValue = { known: '', nested: { value: 'default' } };
		const defaultCodec = object({ known: scalar().default('') })
			.transform<typeof defaultValue>({ encode: value => ({ known: value.known }), decode: value => ({ ...value, nested: { value: 'default' } }) })
			.default(defaultValue)
			.omitWhen(value => !value.known.trim());
		expect(defaultCodec.encode({ known: '  ', nested: { value: 'changed' } }, undefined)).toBeNull();
		const restoredDefault = defaultCodec.decode(null, undefined);
		restoredDefault.nested.value = 'changed';
		expect(defaultCodec.decode(null, undefined).nested.value).toBe('default');
		const contextual = scalar<{ fallback: string }>().default(({ fallback }) => fallback);
		expect(contextual.encode('configured', { fallback: 'configured' })).toBeNull();
		expect(contextual.decode(null, { fallback: 'configured' })).toBe('configured');
		const transformedScope = object({ value: scalar().at('v') })
			.transform<{ value: string }>({ encode: value => value, decode: value => value })
			.scoped('r');
		expect(transformedScope.encode({ value: 'yes' }, undefined)).toBe('r.v=yes');
		expect(() => object({ value: scalar().at('v') }).decode('v=one;v=two', undefined)).throws();
		expect(() => object({ first: scalar().at('v'), second: scalar().at('v') })).throws();
		expect(() => object({ value: scalar().at('v') }).decode('v=one;unknown=one', undefined)).throws();
		expect(() => object({ value: scalar().at('v') }).decode('v=a{;unknown=x}', undefined)).throws();
		expect(() => array(scalar()).decode('one\\', undefined)).throws();
	});

	test('shares scalar and selection representations across compatible controllers', () => {
		expect(restore(filterSelectController, 'one', selectConfig)).toEqual(['one']);
		expect(restore(filterCheckboxController, 'one,two', selectConfig)).toEqual(['one', 'two']);
		expect(restore(annotationSelectController, 'one,two', annotationConfig)).toEqual(['one', 'two']);
		expect(restore(filterRadioController, 'one', selectConfig)).toBe('one');
		expect(() => restore(filterSelectController, 'one,removed', selectConfig)).throws();
	});

	test('rejects repeated controller query values centrally', () => {
		expect(() => restore(filterRadioController, ['one', 'two'], selectConfig)).throws();
	});

	test('uses compact structured codecs for ranges, dates, part-of-speech, and within state', () => {
		const rangeConfig = { kind: 'field' as const, id: 'range', displayName: 'Range', metadataFieldId: 'range' };
		expect(restore(filterRangeController, 'l=10;h=20', rangeConfig)).toEqual({ low: '10', high: '20', mode: 'strict' });
		expect(() => restore(filterRangeController, '10', rangeConfig)).throws();

		const dateConfig = { kind: 'field' as const, id: 'date', displayName: 'Date', metadataFieldId: 'date', range: true };
		expect(restore(filterDateController, 's=2020-01-02;e=2021-03-04;m=p', dateConfig)).toEqual({
			startDate: { y: '2020', m: '01', d: '02' },
			endDate: { y: '2021', m: '03', d: '04' },
			mode: 'permissive',
		});
		expect(() => restore(filterDateController, 's=2020;m=unknown', dateConfig)).throws();
		expect(() => restore(filterDateController, 's=2020-01-02-extra', dateConfig)).throws();
		const posState = { pos: ['VERB'], number: ['singular', 'plural'] };
		expect(encode(annotationPosController, posState, {} as never)).toBe('pos:{VERB};number:{singular,plural}');
		expect(restore(annotationPosController, 'pos:{VERB};number:{singular,plural}', {} as never)).toEqual(posState);
		const withinConfig = {
			kind: 'field' as const,
			id: 'within',
			options: [{ value: 's', label: 'Sentence', attributes: [{ value: 'type', label: 'Type' }] }],
		};
		expect(restore(withinController, 'e=s;a={type:quote}', withinConfig)).toEqual({ element: 's', attributes: { type: 'quote' } });
		expect(() => restore(withinController, 'e=removed', withinConfig)).throws();
		expect(() => restore(withinController, 'e=s;a={removed:value}', withinConfig)).throws();
	});

	test('round-trips parallel state with explicit targets and nested controller payloads', () => {
		const state = {
			source: 'contents__en',
			targets: ['contents__nl'],
			alignBy: 'word-alignment',
			childStates: { contents__en: '[lemma="test"]', contents__nl: '[lemma="proef"]', contents__de: '[lemma="ignored"]' },
		};
		const encoded = encode(parallelController, state, parallelConfig);
		expect(encoded).toContain('s=contents__en');
		expect(encoded).toContain('t={contents__nl}');
		expect(encoded).toContain('q=');
		const restored = restore(parallelController, encoded!, parallelConfig);
		expect(restored).toEqual({ ...state, childStates: { contents__en: '[lemma="test"]', contents__nl: '[lemma="proef"]' } });
		expect(restore(parallelController, encode(parallelController, restored, parallelConfig)!, parallelConfig)).toEqual(restored);
		expect(() => restore(parallelController, 't={contents__fr}', parallelConfig)).throws();
		expect(() => restore(parallelController, 'a=removed', parallelConfig)).throws();
	});

	test('preserves selected parallel targets with default child state', () => {
		const config = { ...parallelConfig, defaultSource: 'contents__en' };
		const state = { source: 'contents__en', targets: ['contents__nl'], alignBy: 'word-alignment', childStates: { contents__en: '', contents__nl: '' } };
		const encoded = encode(parallelController, state, config);
		expect(encoded).toBe('t={contents__nl}');
		expect(restore(parallelController, encoded!, config)).toEqual(state);
	});

	test('persists recursive querybuilder state, regenerates ids, and omits UI-only state', () => {
		const encoded = encode(queryBuilderController, queryBuilderState, queryBuilderConfig);
		expect(encoded).toContain('v=2');
		const restored = restore(queryBuilderController, encoded!, queryBuilderConfig) as CqlQueryBuilderData;
		expect(stripQueryBuilderIds(restored)).toEqual(stripQueryBuilderIds(queryBuilderState));
		expect(restored.tokens[0].id).not.toBe(queryBuilderState.tokens[0].id);
		const restoredAttribute = restored.tokens[0].rootAttributeGroup.entries[0];
		expect('annotationId' in restoredAttribute ? restoredAttribute.uploadedValue : null).toBeUndefined();

		const currentConfig = {
			...queryBuilderConfig,
			options: { ...queryBuilderConfig.options, defaultAnnotationId: 'lemma', annotationOptions: [{ value: 'lemma', label: 'Lemma' }] },
		};
		expect(() => restore(queryBuilderController, encoded!, currentConfig)).throws();
		expect(() => restore(queryBuilderController, encoded!.replace('x=3', 'x=-1'), queryBuilderConfig)).throws();
		expect(() => restore(queryBuilderController, encoded!.replace('x=3', 'x=1.5'), queryBuilderConfig)).throws();
		expect(() => restore(queryBuilderController, encoded!.replace('x=3', 'x=0'), queryBuilderConfig)).throws();
		expect(encode(queryBuilderController, queryBuilderController.createDefaultState(queryBuilderConfig, context), queryBuilderConfig)).toBeNull();
	});

	test('round-trips querybuilder state through parallel child payloads', () => {
		const config = { ...parallelConfig, childFieldTemplate: createFormFieldNode('parallel.querybuilder', queryBuilderController, QueryBuilderField, queryBuilderConfig) };
		const encoded = encode(
			parallelController,
			{
				source: 'contents__en',
				targets: ['contents__nl'],
				alignBy: 'word-alignment',
				childStates: { contents__en: queryBuilderState, contents__nl: queryBuilderState },
			},
			config,
		);
		expect(encoded).toContain('v=2');
		const restored = restore(parallelController, encoded!, config) as { childStates: Record<string, CqlQueryBuilderData> };
		expect(stripQueryBuilderIds(restored.childStates.contents__en)).toEqual(stripQueryBuilderIds(queryBuilderState));
		expect(stripQueryBuilderIds(restored.childStates.contents__nl)).toEqual(stripQueryBuilderIds(queryBuilderState));
	});

	test('rejects duplicate and unsupported structured keys', () => {
		const dateConfig = {
			kind: 'field' as const,
			id: 'date',
			displayName: 'Date',
			metadataFieldId: 'date',
			range: true,
		};

		expect(() => restore(filterDateController, 's=2020;unexpected=value', dateConfig)).throws();
	});
});
