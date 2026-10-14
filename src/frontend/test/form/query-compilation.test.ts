import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';

import { compileFormNode } from '@/features/form/model/compile/form';
import { hasEmissions } from '@/features/form/model/compile/gather';
import { combineCqlPatterns, compileCql, compileFilter } from '@/features/form/model/compile/query-artifact';
import { annotationTextController, type AnnotationTextFieldConfig } from '@/features/form/model/controllers/annotation-controller';
import { resultGroupDisplayModeController } from '@/features/form/model/controllers/result-controllers';
import { createFormFieldNode } from '@/features/form/model/form-field-node';
import { createDefaultFormState } from '@/features/form/model/state';
import type { FieldController, FieldControllerProps, FormRuntimeContext } from '@/features/form/model/types/form-controllers';
import type { FormEmission } from '@/features/form/model/types/form-output';
import type { QueryCombineMode } from '@/features/form/model/types/form-primitives';
import { annotation, booleanNode, filter, filterRange, rawCql, textPredicate, within, withinAttributeRange, type CqlPatternNode } from '@/features/form/model/types/form-query-ir';

import { TestTextField, createTestBuilder, createTestContext, createTestRuntime, testTextController, type TestTextFieldConfig, type TestTextFieldState } from './helpers';

import SelectField from '@/features/form/fields/generic/SelectField.vue';
import TextField from '@/features/form/fields/generic/TextField.vue';
import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

describe('graph query composition', () => {
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

	test.each(compositionExpectations)('$name', ({ combine, expectedPatt }) => {
		const runtime = createCompositionFixture(combine);

		expect(runtime.compile('search.form').params.patt).toBe(expectedPatt);
	});

	test.each([
		['query without a summary', { ...annotationTextController, summarize: undefined }, 'water', true],
		['empty query', annotationTextController, '', false],
		['summary only', { ...annotationTextController, collect() {} }, 'water', false],
		['result preset only', { ...annotationTextController, collect() {}, summarize: undefined, getResultPreset: () => 'table' as const }, 'water', false],
	] as const)('hasEmissions checks %s', (_name, controller, value, expected) => {
		const field = createFormFieldNode('word', controller, TextField, { annotationId: 'word', displayName: 'Word' });

		expect(hasEmissions(field, { value, caseSensitive: false }, createTestContext())).toBe(expected);
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
});

describe('compiled form snapshots', () => {
	test('compiles only registered form boundaries', () => {
		const builder = createTestBuilder();
		const root = builder.newContainer('root', ContainerRenderer, {});
		builder.newForm('form', ContainerRenderer, {});
		const runtime = createTestRuntime(builder);

		expect(() => runtime.compile(root.id)).toThrow("Cannot compile unknown form 'root'.");
	});

	test('compile detaches nested summaries, encoded tabs, and result presets from later runtime edits', () => {
		const builder = createTestBuilder();
		const form = builder.newForm('search.simple', ContainerRenderer, { title: 'Simple' });
		type SnapshotState = TestTextFieldState & { groupBy: string[]; groupDisplayMode: 'table' | 'tokens'; summaryTypes: Array<'filter' | 'patt'> };
		const snapshotController: FieldController<'snapshot-text', SnapshotState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'snapshot-text',
			createDefaultState: () => ({ value: '', groupBy: [], groupDisplayMode: 'table', summaryTypes: [] }),
			persistence: {
				...testTextController.persistence,
				codec: testTextController.persistence.codec.transform<SnapshotState>({
					encode: state => ({ value: state.value }),
					decode: state => ({ ...state, groupBy: [], groupDisplayMode: 'table', summaryTypes: [] }),
				}),
			},
			outputs: ['patt', 'group'],
			collect(config, _context, state, emit) {
				const pattern = annotation(config.annotationId, 'wildcard', state.value);
				if (pattern) emit('patt', pattern);
				emit('group', state.groupBy);
			},
			getResultPreset: (_config, _context, state) => state.groupDisplayMode,
			summarize(_config, _context, state, emit) {
				if (state.value) emit({ label: 'Word', value: state.value, summaryType: state.summaryTypes });
			},
		};
		const field = builder.newField('search.simple.word', snapshotController, TestTextField, {
			annotationId: 'word',
			displayName: 'Word',
		});
		const alternative = builder.newContainer('search.simple.alternative', ContainerRenderer, {});
		const tabs = builder.newContainer('search.simple.tabs', ContainerRenderer, {});
		tabs.prependChild(alternative, { outputWhenActive: emit => emit('searchfield', 'alternative') });
		tabs.prependChild(field, { outputWhenActive: emit => emit('searchfield', 'contents') });
		form.addChildren(tabs);

		const runtime = createTestRuntime(builder);
		const callerOwnedState: SnapshotState = { value: 'water', groupBy: ['water'], groupDisplayMode: 'table', summaryTypes: ['patt'] };
		runtime.state.state.value[field.id] = callerOwnedState;

		const submitted = runtime.compile(form.id);
		callerOwnedState.value = 'fire';
		callerOwnedState.groupBy[0] = 'fire';
		callerOwnedState.groupDisplayMode = 'tokens';
		callerOwnedState.summaryTypes[0] = 'filter';
		runtime.state.uiState.value[tabs.id] = alternative.id;

		expect(runtime.compile(form.id)).toMatchObject({
			params: { group: 'fire', searchfield: 'alternative' },
			encoded: { 'f.tab': [`${tabs.id}:${alternative.id}`] },
			resultPreset: 'tokens',
			summaries: [{ label: 'Word', value: 'fire', summaryType: ['filter'] }],
		});
		expect(submitted).toMatchObject({
			params: { group: 'water', patt: '[word="water"]', searchfield: 'contents' },
			encoded: {
				'f.form': form.id,
				'f.tab': [`${tabs.id}:${field.id}`],
				'f.word': 'water',
			},
			resultPreset: 'table',
			summaries: [{ label: 'Word', value: 'water', summaryType: ['patt'] }],
		});
	});
});

describe('query serialization and normalization', () => {
	const context: FormRuntimeContext = {
		corpus: { indexId: '', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};

	function collect<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): FormEmission[] {
		const emissions: FormEmission[] = [];
		controller.collect(config, context, state, (name, value) => emissions.push({ name, value } as FormEmission));
		return emissions;
	}

	function patt<State, Extra>(controller: FieldController<string, State, Extra>, config: FieldControllerProps<Extra>, state: State): CqlPatternNode | null {
		return (collect(controller, config, state).find(emission => emission.name === 'patt')?.value as CqlPatternNode | undefined) ?? null;
	}

	function annotationConfig(annotationId: string): FieldControllerProps<AnnotationTextFieldConfig> {
		return { annotationId, displayName: annotationId, id: annotationId, kind: 'field' };
	}

	test('and/or composition folds compatible token predicates', () => {
		const word = annotation('word', 'wildcard', 'water')!;
		const lemma = annotation('lemma', 'wildcard', 'water')!;
		expect(compileCql(combineCqlPatterns([word, lemma], 'and')!)).toBe('[word="water" & lemma="water"]');
		expect(compileCql(combineCqlPatterns([word, lemma], 'or')!)).toBe('[word="water" | lemma="water"]');
	});

	test('sequence composition preserves child order', () => {
		const pattern = combineCqlPatterns([annotation('word', 'literal', 'water')!, annotation('lemma', 'literal', 'flow')!], 'sequence')!;
		expect(compileCql(pattern)).toBe('[word=l"water"] [lemma=l"flow"]');
	});

	test('compiles Lucene conjunctions', () => {
		const node = booleanNode('and', [filter('author', 'literal', 'Austen')!, filter('year', 'literal', '1813')!])!;
		expect(compileFilter(node)).toBe('(author:(Austen) AND year:(1813))');
	});

	test('drops empty Lucene text while retaining a complete range', () => {
		const node = booleanNode('and', [filter('author', 'literal', ' ')!, filterRange('year', '1800', '1900')!])!;
		expect(compileFilter(node)).toBe('year:[1800 TO 1900]');
	});

	test('normalizes compatible CQL and Lucene alternatives', () => {
		const cql = booleanNode('or', [annotation('word', 'literal', 'a*')!, annotation('lemma', 'literal', 'c')!, annotation('word', 'wildcard', 'b*')!])!;
		const lucene = booleanNode('or', [filter('author', 'literal', 'A*')!, filter('title', 'literal', 'C')!, filter('author', 'wildcard', 'B*')!])!;
		expect(compileCql(cql)?.slice(1, -1).split(' | ').sort()).toEqual([String.raw`word="a\*|b.*"`, 'lemma=l"c"'].sort());
		expect(compileFilter(lucene)?.slice(1, -1).split(' OR ').sort()).toEqual([String.raw`author:(/A\*|B.*/)`, 'title:(C)'].sort());
	});

	test('complete-query wrappers are extracted regardless of graph position', () => {
		const pattern = combineCqlPatterns([rawCql('[word="water"]'), booleanNode<CqlPatternNode>('or', [within('speech', { person: textPredicate('wildcard', 'Alice*') }), within('p')])!], 'sequence')!;
		expect(compileCql(pattern)).toBe('([word="water"]) within <speech person="Alice.*"/> overlap <p/>');
	});

	test('multiple within nodes merge matching elements and overlap distinct elements', () => {
		const range = { low: '3', high: '9999' };
		const pattern = combineCqlPatterns(
			[
				rawCql('[word="water"]'),
				within('speech', { person: textPredicate('wildcard', 'Alice*') }),
				within('speech', { role: textPredicate('literal', 'host') }),
				within('p', withinAttributeRange('n', range)),
			],
			'and',
		)!;
		expect(compileCql(pattern)).toBe('([word="water"]) within <speech person="Alice.*" role="host"/> overlap <p n=in[3,9999]/>');
	});

	test('combines uneven token sequences per position', () => {
		const word = patt(annotationTextController, annotationConfig('word'), { caseSensitive: true, value: 'a b' })!;
		const lemma = patt(annotationTextController, annotationConfig('lemma'), { caseSensitive: true, value: 'c d e' })!;
		expect(compileCql(combineCqlPatterns([word, lemma], 'and')!)).toBe(String.raw`[word="(?-i)a" & lemma="(?-i)c"] [word="(?-i)b" & lemma="(?-i)d"] [lemma="(?-i)e"]`);
		expect(compileCql(combineCqlPatterns([word, lemma], 'or')!)).toBe(String.raw`[word="(?-i)a" | lemma="(?-i)c"] [word="(?-i)b" | lemma="(?-i)d"] [lemma="(?-i)e"]`);
	});

	test('merges compatible alternatives across structured boundaries', () => {
		const pattern = booleanNode<CqlPatternNode>('or', [
			annotation('word', 'wildcard', 'a')!,
			booleanNode('and', [annotation('lemma', 'wildcard', 'b')!, annotation('pos', 'wildcard', 'N')!])!,
			annotation('word', 'wildcard', 'c')!,
		])!;
		expect(compileCql(pattern)?.slice(1, -1).split(' | ').sort()).toEqual(['word="a|c"', '(lemma="b" & pos="N")'].sort());
	});

	test('keeps comparison and sensitivity semantics separate', () => {
		const pattern = booleanNode('or', [
			annotation('word', 'literal', 'a', { caseSensitive: true })!,
			annotation('word', 'literal', 'b', { caseSensitive: false })!,
			annotation('word', 'literal', 'c', { caseSensitive: false, operator: '!=' })!,
		])!;
		expect(compileCql(pattern)?.slice(1, -1).split(' | ').sort()).toEqual(['word=l"(?-i)a"', 'word=l"(?i)b"', 'word!=l"(?i)c"'].sort());
	});

	test('merges compatible negative token predicates under and', () => {
		const options = { caseSensitive: true, operator: '!=' as const };
		const pattern = booleanNode('and', [annotation('word', 'literal', 'a', options)!, annotation('word', 'wildcard', 'b*', options)!])!;
		expect(compileCql(pattern)).toBe('[word!="(?-i)a|b.*"]');
	});

	test('merges all compatible Lucene alternatives', () => {
		const node = booleanNode('or', [filter('author', 'literal', 'A|B')!, filter('author', 'wildcard', 'C*')!, filter('title', 'literal', 'D')!, filter('author', 'literal', 'E')!])!;
		expect(compileFilter(node)?.slice(1, -1).split(' OR ').sort()).toEqual([String.raw`author:(/A\|B|C.*|E/)`, 'title:(D)'].sort());
	});

	test('flattens matching CQL and Lucene boolean operators', () => {
		const cql = booleanNode('and', [rawCql('[word="a"]'), booleanNode('and', [rawCql('[lemma="b"]'), rawCql('[pos="N"]')])!])!;
		const lucene = booleanNode('and', [filter('author', 'literal', 'alice')!, booleanNode('and', [filter('title', 'literal', 'water')!, filter('year', 'literal', '2020')!])!])!;
		expect(compileCql(cql)).toBe('([word="a"] & [lemma="b"] & [pos="N"])');
		expect(compileFilter(lucene)).toBe('(author:(alice) AND title:(water) AND year:(2020))');
	});

	test('emits escaped wrapper values, complete ranges, and empty tags', () => {
		const people = booleanNode('or', [textPredicate('wildcard', 'A"B'), textPredicate('wildcard', 'C?')])!;
		const pattern = combineCqlPatterns([within('speech', { person: people }), within('p', withinAttributeRange('n', { low: '0', high: '5' })), within('div')], 'and')!;
		expect(compileCql(pattern)).toBe(String.raw`<speech person="A\\"B|C."/> overlap <p n=in[0,5]/> overlap <div/>`);
	});

	test('keeps explicit regex wrapper predicates separate from escaped values', () => {
		const values = booleanNode('or', [textPredicate('literal', 'A*'), textPredicate('wildcard', 'B*'), textPredicate('wildcard', String.raw`D\*`), textPredicate('regex', 'C/.+')])!;
		expect(
			compileCql(within('speech', { person: values }))
				?.slice(9, -3)
				.split(' | ')
				.sort(),
		).toEqual([String.raw`person="A\*|B.*|D\*"`, 'person="C/.+"'].sort());
	});
});

describe('compiled result presets', () => {
	test('includes a field-provided table-mode preset in compiled output', () => {
		const builder = createTestBuilder();
		const resultPresetController: FieldController<'result-preset-text', TestTextFieldState, TestTextFieldConfig> = {
			...testTextController,
			kind: 'result-preset-text',
			collect: testTextController.collect,
			getResultPreset: () => 'table',
		};
		const field = builder.newField('explore.corpora.options', resultPresetController, TestTextField, {
			annotationId: 'word',
			displayName: 'Options',
		});
		const form = builder.newForm('explore.corpora', ContainerRenderer, {}).addChildren(field);
		const state = createDefaultFormState(builder.context, builder.getRoot());
		state.state[field.id] = { value: 'field:date' };

		const compiled = compileFormNode(form, state, builder.context);

		expect(compiled.resultPreset).toBe('table');
	});

	test('group-display-mode controller contributes only groupDisplayMode', () => {
		const builder = createTestBuilder();
		const field = builder.newField('display', resultGroupDisplayModeController, SelectField, { displayName: 'Display', options: [], persistKey: 'display' });
		const form = builder.newForm('form', ContainerRenderer, {}).addChildren(field);
		const state = createDefaultFormState(builder.context, form);
		state.state[field.id] = 'tokens';

		expect(compileFormNode(form, state, builder.context)).toMatchObject({ params: {}, resultPreset: 'tokens' });
	});

	test('keeps the first frontend-result contribution through nested containers', () => {
		const builder = createTestBuilder();
		const first = builder.newField('display.first', resultGroupDisplayModeController, SelectField, {
			displayName: 'First',
			options: [],
			persistKey: 'display-first',
		});
		const second = builder.newField('display.second', resultGroupDisplayModeController, SelectField, {
			displayName: 'Second',
			options: [],
			persistKey: 'display-second',
		});
		const form = builder.newForm('explore.form', ContainerRenderer, {}).addChildren(builder.newContainer('display.container', ContainerRenderer, {}).addChildren(first, second));
		const state = createDefaultFormState(builder.context, form);
		state.state[first.id] = 'tokens';
		state.state[second.id] = 'table';

		expect(compileFormNode(form, state, builder.context).resultPreset).toBe('tokens');
	});
});
