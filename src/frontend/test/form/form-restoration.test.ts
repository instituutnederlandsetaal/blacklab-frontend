import { describe, expect, test } from 'vitest';

import {
	array,
	compileFormNode,
	createCollocationTarget,
	createDefaultFormState,
	createFormFieldNode,
	expertQueryController,
	filterTextController,
	hitsSearchTarget,
	object,
	parallelController,
	restoreForm,
	scalar,
	type FieldController,
} from '@/features/form';
import { type FormOverrides } from '@/features/form/model/types/blacklab-params';
import { filter } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestContext, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import TextField from '@/features/form/fields/generic/TextField.vue';
import ParallelField from '@/features/form/fields/ParallelField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('form persistence and restoration', () => {
	function restoreFormState(definition: ReturnType<typeof createTestBuilder>, query: Record<string, unknown>, overrides?: FormOverrides) {
		return restoreForm(definition, query, overrides).state;
	}

	function createSingleTextForm() {
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended' }).addChildren(field);
		return {
			definition: builder,
			field,
			form,
		};
	}

	function createCanonicalFallbackFixture() {
		const builder = createTestBuilder();
		const root = builder.newContainer('search', ContainerRenderer, {
			title: 'Search',
			mode: 'tabs',
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

	test('uses properties when object prototype is null', () => {
		const fixture = createSingleTextForm();
		const query = Object.assign(Object.create(null), { 'f.form': 'search.extended' }) as Record<string, unknown>;

		expect(restoreForm(fixture.definition, query).submittedResult?.formId).toBe('search.extended');
	});

	test('ignores properties from modified object prototype', () => {
		const fixture = createSingleTextForm();
		const query = Object.create({ 'f.form': 'search.extended' }) as Record<string, unknown>;

		expect(restoreForm(fixture.definition, query).submittedResult).toBeNull();
	});

	test('encodes form and field state under readable scoped keys', () => {
		const fixture = createSingleTextForm();
		const state = createDefaultFormState(fixture.definition.context, fixture.definition.getRoot());
		state.state[fixture.field.id] = { value: 'water' };

		const encoded = compileFormNode(fixture.form, state, fixture.definition.context).encoded;

		expect(encoded).toEqual({
			'f.form': 'search.extended',
			'f.word': 'water',
		});
	});

	test('restores scoped state without consuming unrelated unscoped parameters', () => {
		const fixture = createSingleTextForm();

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
	});

	test('restores the submitted query, summaries, preset, and diagnostics together', () => {
		const collect = (...args: Parameters<typeof testTextController.collect>) => {
			testTextController.collect(...args);
			throw new Error('compile diagnostic');
		};
		const controller: FieldController<'restoration-reuse', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'restoration-reuse',
			collect,
			getResultPreset: () => 'table',
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', controller, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const form = builder.newForm('search.extended', ContainerRenderer, {}).addChildren(field);
		const restored = restoreForm(
			builder,
			{
				'f.form': form.id,
				'f.word': 'water',
				'f.removed': 'stale',
			},
			{ patt: '[word="(?i)fire"]' },
		);

		expect(restored.submittedResult).toMatchObject({
			formId: form.id,
			params: { patt: '[word="(?i)fire"]' },
			encoded: { 'f.form': form.id, 'f.word': 'water' },
			summaries: [{ label: 'Word', value: 'water', summaryType: ['patt'] }],
			resultPreset: 'table',
		});
		expect(restored.submittedResult?.issues).toEqual([
			{ severity: 'warning', message: "No current form field accepts persisted key 'removed'." },
			{ severity: 'error', message: `Controller for '${field.id}' failed: compile diagnostic` },
		]);
	});

	test('discards baseline requiredness diagnostics resolved by a restored override', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.hits', ContainerRenderer, { target: hitsSearchTarget });
		const restored = restoreForm(builder, { 'f.form': form.id }, { patt: '[word="water"]' });

		expect(restored.state.rawOverrides).toEqual({ patt: '[word="water"]' });
		expect(restored.submittedResult).toMatchObject({ params: { patt: '[word="water"]' }, issues: [] });
	});

	test('compares collocation context with defaults and rejects an invalid override', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('collocations.form', ContainerRenderer, { target: createCollocationTarget('word') });
		const canonical = restoreForm(builder, { 'f.form': form.id }, { patt: '[word="water"]', colltype: 'proximity', context: 5 });

		expect(canonical.state.rawOverrides).toEqual({ patt: '[word="water"]' });
		expect(canonical.submittedResult).toMatchObject({ params: { patt: '[word="water"]', colltype: 'proximity', context: 5 }, issues: [] });

		const changed = restoreForm(builder, { 'f.form': form.id }, { patt: '[word="water"]', colltype: 'proximity', context: 6 });
		expect(changed.state.rawOverrides).toEqual({ patt: '[word="water"]', context: 6 });
		expect(changed.submittedResult).toMatchObject({ params: { patt: '[word="water"]', context: 6 } });

		const invalid = restoreForm(builder, { 'f.form': form.id }, { patt: '[word="water"]', colltype: 'proximity', context: null });
		expect(invalid.state.rawOverrides).toEqual({ patt: '[word="water"]', context: null });
		expect(invalid.submittedResult?.params.patt).toBeUndefined();
		expect(invalid.submittedResult?.issues).toContainEqual({ severity: 'error', message: "Restored override 'context' must be a safe non-negative integer or before:after pair." });
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
		expect(restored.issues).toEqual([
			{ severity: 'warning', message: "No current form accepts persisted selector 'removed-form'." },
			{ severity: 'warning', message: "No current form field accepts persisted key 'v'." },
			{ severity: 'warning', message: "No current form field accepts persisted key 'removed'." },
		]);
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
		expect(restored.issues).toEqual([{ severity: 'error', message: `Could not restore persisted field 'word' for '${field.id}': Unsupported historical value.` }]);
	});

	test.each([
		[
			'throwing',
			(): string => {
				throw new Error('broken persistence key');
			},
			"Could not resolve persistence key for 'search.invalid.word': broken persistence key",
		],
		['non-string', (): string => 42 as unknown as string, "Field 'search.invalid.word' has an invalid form persistence key."],
		['empty', (): string => '', "Field 'search.invalid.word' has an invalid form persistence key ''."],
		['reserved form selector', (): string => 'form', "Field 'search.invalid.word' uses reserved form persistence key 'form'."],
		['reserved tab selector', (): string => 'tab', "Field 'search.invalid.word' uses reserved form persistence key 'tab'."],
	] as const)('reports a %s persistence key consistently without aborting restoration', (_name, key, message) => {
		const controller: FieldController<'invalid-persistence-key', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'invalid-persistence-key',
			persistence: { ...testTextController.persistence, key },
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.invalid.word', controller, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const form = builder.newForm('search.invalid', ContainerRenderer, {}).addChildren(field);
		const state = createDefaultFormState(builder.context, form);
		state.state[field.id] = { value: 'water' };

		expect(compileFormNode(form, state, builder.context).issues).toContainEqual({ severity: 'error', message });

		const restored = restoreFormState(builder, { 'f.form': form.id, 'f.unknown': 'water' });
		expect(restored.issues).toContainEqual({ severity: 'error', message });
	});

	test('continues gathering when a persistence key fails', () => {
		const controller: FieldController<'broken-persistence-key', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'broken-persistence-key',
			persistence: {
				...testTextController.persistence,
				key: () => {
					throw new Error('broken persistence key');
				},
			},
			getResultPreset: () => 'table',
		};
		const builder = createTestBuilder();
		const field = builder.newField('search.extended.word', controller, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const form = builder.newForm('search.extended', ContainerRenderer, {}).addChildren(field);
		const state = createDefaultFormState(builder.context, form);
		state.state[field.id] = { value: 'water' };

		const compiled = compileFormNode(form, state, builder.context);

		expect(compiled.params.patt).toBe('[word="water"]');
		expect(compiled.resultPreset).toBe('table');
		expect(compiled.issues).toEqual([{ severity: 'error', message: `Could not resolve persistence key for '${field.id}': broken persistence key` }]);
	});

	test('reports a present scoped field without a decodable value', () => {
		const fixture = createSingleTextForm();

		const restored = restoreFormState(fixture.definition, { 'f.word': null });

		expect(restored.state[fixture.field.id]).toEqual({ value: '' });
		expect(restored.issues).toEqual([{ severity: 'warning', message: `Persisted field 'word' for '${fixture.field.id}' has no value.` }]);
	});

	test('compares supplied overrides without interpreting unscoped query parameters', () => {
		const fixture = createSingleTextForm();
		const query = {
			'f.form': fixture.form.id,
			'f.word': 'water',
			patt: '[word="(?i)fire"]',
		};

		expect(restoreForm(fixture.definition, query).state.rawOverrides).toEqual({});
		expect(restoreForm(fixture.definition, query, { patt: '[word="(?i)fire"]' }).state.rawOverrides).toEqual({ patt: '[word="(?i)fire"]' });
	});

	test('continues restoring other fields after one controller rejects its payload', () => {
		const rejectingController: FieldController<'rejecting-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'rejecting-text',
			persistence: {
				...testTextController.persistence,
				codec: object({ values: array(scalar()).at('v') }).transform<TestTextFieldState>({
					encode: state => ({ values: [state.value] }),
					decode: state => ({ value: state.values[0] ?? '' }),
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
			'f.word': 'v={water\\q}',
			'f.author': 'Austen',
		});

		expect(restored.issues).toEqual([{ severity: 'error', message: `Could not restore persisted field 'word' for '${word.id}': Persisted value contains invalid escape '\\q'.` }]);
		expect(restored.state[word.id]).toEqual({ value: '' });
		expect(restored.state[author.id]).toEqual({ value: 'Austen', caseSensitive: false });
	});

	test('uses the expert CQL field for old raw URLs that only contain canonical patt', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, {}, { patt: '[word="water"]' });

		expect(restored.uiState.search).toBe('search.expert');
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
	});

	test('uses an expert CQL field wrapped in a parallel field for canonical patt', () => {
		const context = createTestContext();
		const builder = createTestBuilder({
			...context,
			corpus: { ...context.corpus, isParallelCorpus: true },
		});
		const root = builder.newContainer('search', ContainerRenderer, { title: 'Search', mode: 'tabs' });
		const simple = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		const expert = builder.newForm('search.expert', ContainerRenderer, { title: 'Expert' });
		const parallelField = builder.newField('search.expert.parallel', parallelController, ParallelField, {
			childFieldTemplate: createFormFieldNode('search.expert.parallel.query', expertQueryController, RawCqlField, {}),
			defaultSource: 'contents__en',
			fieldOptions: [{ id: 'contents__en' }, { id: 'contents__nl' }],
		});
		expert.addChildren(parallelField);
		root.addChildren(simple, expert);

		const restored = restoreFormState(builder, {}, { patt: '[word="water"]' });

		expect(restored.uiState.search).toBe(expert.id);
		expect(restored.state[parallelField.id]).toEqual({
			source: 'contents__en',
			targets: [],
			alignBy: null,
			childStates: { contents__en: '[word="water"]' },
		});
		expect(restored.rawOverrides).toEqual({});
	});

	test('ignores unusable scoped noise when falling back to canonical patt', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(
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
		expect(restored.issues).toEqual([
			{ severity: 'warning', message: "No current form accepts persisted selector 'removed-form'." },
			{ severity: 'warning', message: "No current form container accepts persisted tab key 'missing'." },
			{ severity: 'warning', message: "No current form field accepts persisted key 'removed'." },
		]);
	});

	test('does not treat a form selector by itself as restorable query state', () => {
		const fixture = createCanonicalFallbackFixture();

		const result = restoreForm(fixture.definition, { 'f.form': fixture.simple.id }, { patt: '[word="water"]' });
		const restored = result.state;

		expect(result.submittedResult).toBeNull();

		expect(restored.uiState.search).toBe(fixture.expert.id);
		expect(restored.state[fixture.rawField.id]).toBe('[word="water"]');
		expect(restored.rawOverrides).toEqual({});
		expect(restored.issues).toEqual([]);
	});

	test('keeps the scoped form active when a persisted tab selection conflicts with it', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, {
			'f.form': fixture.simple.id,
			'f.tab': `search:${fixture.expert.id}`,
		});

		expect(restored.uiState.search).toBe(fixture.simple.id);
	});

	test('uses valid scoped field state instead of canonical-only fallback', () => {
		const fixture = createCanonicalFallbackFixture();

		const restored = restoreFormState(fixture.definition, { 'f.word': 'water' }, { patt: '[word="fire"]' });

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
		});
		const filters = builder.newContainer('search.extended.filters', ContainerRenderer, { title: 'Filters', mode: 'tabs' });
		filters.prependChild(newspapers, { outputWhenActive: emit => emit('filter', filter('category', 'literal', 'newspaper')!) });
		filters.prependChild(builder.newContainer('search.extended.filters.shared', ContainerRenderer, { title: 'Shared' }));
		form.addChildren(filters);
		const definition = builder;
		const context = createTestContext();
		const state = createDefaultFormState(context, definition.getRoot());
		state.uiState[filters.id] = newspapers.id;

		const encoded = compileFormNode(form, state, context).encoded;

		expect(encoded['f.tab']).toEqual(['search.extended.filters:search.extended.filters.newspapers']);

		const restored = restoreFormState(definition, encoded, { filter: 'category:(newspaper)' });

		expect(restored.uiState[filters.id]).toBe(newspapers.id);
		expect(restored.rawOverrides).toEqual({});
		expect(compileFormNode(form, restored, context)).toMatchObject({
			params: { filter: 'category:(newspaper)' },
			encoded: {
				'f.tab': ['search.extended.filters:search.extended.filters.newspapers'],
			},
		});
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
				mode: 'tabs',
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
		const tabs = builder.newContainer('search.extended.tabs', ContainerRenderer, { title: 'Tabs', mode: 'tabs' }).addChildren(first, second);
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
		const tabs = builder.newContainer('search.extended.tabs', ContainerRenderer, { title: 'Tabs', mode: 'tabs' }).addChildren(first, second);
		form.addChildren(tabs);

		const restored = restoreFormState(builder, { 'f.word': 'water', 'f.tab': `${tabs.id}:${first.id}` });

		expect(restored.uiState[tabs.id]).toBe(first.id);
	});

	test('prefers the canonical path to a persisted field shared with a detached graph', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.shared', ContainerRenderer, {});
		const first = builder.newContainer('search.shared.tabs.first', ContainerRenderer, {});
		const shared = builder.newField('search.shared.word', testTextController, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const second = builder.newContainer('search.shared.tabs.second', ContainerRenderer, {}).addChildren(shared);
		const tabs = builder.newContainer('search.shared.tabs', ContainerRenderer, { mode: 'tabs' }).addChildren(first, second);
		form.addChildren(tabs);
		builder.newContainer('detached', ContainerRenderer, {}).addChildren(shared);

		const restored = restoreFormState(builder, { 'f.form': form.id, 'f.word': 'water' });

		expect(restored.uiState[tabs.id]).toBe(second.id);
	});

	test('activates persisted fields in a detached selected form without activating an unrelated registered path', () => {
		const builder = createTestBuilder();
		const shared = builder.newField('search.shared.word', testTextController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const unrelatedFirst = builder.newContainer('search.first.tabs.first', ContainerRenderer, { title: 'First' });
		const unrelatedSecond = builder.newContainer('search.first.tabs.second', ContainerRenderer, { title: 'Second' }).addChildren(shared);
		const unrelatedTabs = builder.newContainer('search.first.tabs', ContainerRenderer, { title: 'Tabs', mode: 'tabs' }).addChildren(unrelatedFirst, unrelatedSecond);
		builder.newForm('search.first', ContainerRenderer, { title: 'First' }).addChildren(unrelatedTabs);
		const secondForm = builder.newForm('search.second', ContainerRenderer, { title: 'Second' });
		const first = builder.newContainer('search.second.tabs.first', ContainerRenderer, { title: 'First' });
		const second = builder.newContainer('search.second.tabs.second', ContainerRenderer, { title: 'Second' }).addChildren(shared);
		const tabs = builder.newContainer('search.second.tabs', ContainerRenderer, { title: 'Tabs', mode: 'tabs' }).addChildren(first, second);
		secondForm.addChildren(tabs);

		const restored = restoreFormState(builder, { 'f.form': secondForm.id, 'f.word': 'water' });

		expect(restored.uiState[secondForm.id]).toBe(tabs.id);
		expect(restored.uiState[tabs.id]).toBe(second.id);
		expect(restored.uiState[unrelatedTabs.id]).toBe(unrelatedFirst.id);
	});

	test('reports duplicate keys consistently and restores only the first field', () => {
		const firstController = { ...testTextController, kind: 'first-duplicate-key', persistence: { ...testTextController.persistence, key: () => 'word' } } as const;
		const secondController = { ...testTextController, kind: 'second-duplicate-key', persistence: { ...testTextController.persistence, key: () => 'word' } } as const;
		const builder = createTestBuilder();
		const first = builder.newField('search.duplicate.first', firstController, TestTextField, { annotationId: 'word', displayName: 'First' });
		const second = builder.newField('search.duplicate.second', secondController, TestTextField, { annotationId: 'lemma', displayName: 'Second' });
		const form = builder.newForm('search.duplicate', ContainerRenderer, {}).addChildren(first, second);
		const state = createDefaultFormState(builder.context, form);
		state.state[first.id] = { value: 'water' };
		state.state[second.id] = { value: 'fire' };

		const compiledIssue = compileFormNode(form, state, builder.context).issues.find(issue => issue.message.includes(second.id))!;
		expect(compiledIssue).toEqual({ severity: 'error', message: `Duplicate form persistence key 'word' for '${second.id}' and '${first.id}'.` });

		const restored = restoreFormState(builder, { 'f.form': form.id, 'f.word': 'water' });

		expect(restored.state[first.id]).toEqual({ value: 'water' });
		expect(restored.state[second.id]).toEqual({ value: '' });
		expect(restored.issues).toContainEqual(compiledIssue);
	});
});

describe('restored field path selection', () => {
	test('activates the first persisted descendant in schema order rather than query order', () => {
		const builder = createTestBuilder();
		const firstField = builder.newField('search.tabs.first.word', testTextController, TestTextField, { annotationId: 'first', displayName: 'First' });
		const secondField = builder.newField('search.tabs.second.word', testTextController, TestTextField, { annotationId: 'second', displayName: 'Second' });
		const first = builder.newContainer('search.tabs.first', ContainerRenderer, {}).addChildren(firstField);
		const second = builder.newContainer('search.tabs.second', ContainerRenderer, {}).addChildren(secondField);
		const tabs = builder.newContainer('search.tabs', ContainerRenderer, { mode: 'tabs' }).addChildren(first, second);
		builder.newForm('search.form', ContainerRenderer, {}).addChildren(tabs);

		const restored = restoreForm(builder, { 'f.second': 'two', 'f.first': 'one' }).state;

		expect(restored.uiState[tabs.id]).toBe(first.id);
		expect(restored.state[firstField.id]).toEqual({ value: 'one' });
		expect(restored.state[secondField.id]).toEqual({ value: 'two' });
	});

	test('activates both secondary unique paths without replacing the first common choice', () => {
		const builder = createTestBuilder();
		const shared = builder.newField('search.shared.word', testTextController, TestTextField, { annotationId: 'word', displayName: 'Word' });
		const firstBranch = builder.newContainer('search.outer.first', ContainerRenderer, {}).addChildren(shared);
		const firstNestedDefault = builder.newContainer('search.first-nested.default', ContainerRenderer, {});
		const firstNestedShared = builder.newContainer('search.first-nested.shared', ContainerRenderer, {}).addChildren(shared);
		const firstNestedTabs = builder.newContainer('search.first-nested', ContainerRenderer, { mode: 'tabs' }).addChildren(firstNestedDefault, firstNestedShared);
		const secondBranch = builder.newContainer('search.outer.second', ContainerRenderer, {}).addChildren(firstNestedTabs);
		const secondNestedDefault = builder.newContainer('search.second-nested.default', ContainerRenderer, {});
		const secondNestedShared = builder.newContainer('search.second-nested.shared', ContainerRenderer, {}).addChildren(shared);
		const secondNestedTabs = builder.newContainer('search.second-nested', ContainerRenderer, { mode: 'tabs' }).addChildren(secondNestedDefault, secondNestedShared);
		const thirdBranch = builder.newContainer('search.outer.third', ContainerRenderer, {}).addChildren(secondNestedTabs);
		const outerTabs = builder.newContainer('search.outer', ContainerRenderer, { mode: 'tabs' }).addChildren(firstBranch, secondBranch, thirdBranch);
		builder.newForm('search.form', ContainerRenderer, {}).addChildren(outerTabs);

		const restored = restoreForm(builder, { 'f.word': 'water' }).state;

		expect(restored.uiState[outerTabs.id]).toBe(firstBranch.id);
		expect(restored.uiState[firstNestedTabs.id]).toBe(firstNestedShared.id);
		expect(restored.uiState[secondNestedTabs.id]).toBe(secondNestedShared.id);
		expect(restored.state[shared.id]).toEqual({ value: 'water' });
	});
});
