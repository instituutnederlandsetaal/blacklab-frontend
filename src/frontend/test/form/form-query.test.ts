// @vitest-environment jsdom

import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test } from 'vitest';

import {
	annotationTextController,
	createFormFieldNode,
	expertQueryController,
	filterDateController,
	filterRadioController,
	filterSelectController,
	filterTextController,
	parallelController,
	type FieldControllerProps,
	type FormRuntimeContext,
} from '@/features/form';
import { combineQueries, compileQueryIR, simplifyQueryIR } from '@/features/form/model/compile/query-artifact';
import type { AnnotationTextFieldConfig } from '@/features/form/model/controllers/annotation-controller';
import { annotation, booleanNode, filter, filterRange, queryFragment, queryIR, rangePredicate, rawCql, textPredicate, within, type QueryIR } from '@/features/form/model/types/form-query-ir';

import RawCqlField from '@/features/form/fields/RawCqlField.vue';

describe('generated query correctness', () => {
	const context: FormRuntimeContext = {
		corpus: { indexId: '', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};

	function contribForAnnotation(annotId: string, value: string, caseSensitive = false): QueryIR {
		const field: FieldControllerProps<AnnotationTextFieldConfig> = {
			annotationId: annotId,
			displayName: '',
			id: annotId,
			kind: 'field',
		};

		return annotationTextController.getQueryContribution(field, context, {
			caseSensitive,
			value,
		})!;
	}

	function compileValueForAnnotation(annotId: string, value: string, caseSensitive = false) {
		return compileQueryIR(contribForAnnotation(annotId, value, caseSensitive)).patt;
	}

	test('Text field controller tokenizes input and treats wildcards correctly', () => {
		const compiled = compileValueForAnnotation('lemma', `"this is" a?|example sentence* `, false);
		const expected = [`[lemma="this is"]`, `[lemma="a.|example"]`, `[lemma="sentence.*"]`].join(' ');

		expect(compiled).toBe(expected);
	});

	test('Text field controller handles escaped wildcards correctly', () => {
		const compiled = compileValueForAnnotation('lemma', String.raw`a\*b c\?d e\\f`, true);
		const expected = String.raw`[lemma="(?-i)a\*b"] [lemma="(?-i)c\?d"] [lemma="(?-i)e\\\\f"]`;

		expect(compiled).toBe(expected);
	});

	test('metadata text controller preserves parsed value intent in filter IR', () => {
		const contribution = filterTextController.getQueryContribution(
			{
				kind: 'field',
				id: 'author',
				displayName: 'Author',
				metadataFieldId: 'author',
			},
			context,
			{ value: String.raw`Alice* "Bob?"`, caseSensitive: false },
		)!;

		expect(contribution.filter).toEqual(
			booleanNode('or', { type: 'lucene-field', field: 'author', ...textPredicate('wildcard', 'Alice*') }, { type: 'lucene-field', field: 'author', ...textPredicate('literal', 'Bob?') }),
		);
	});

	test('Lucene emission distinguishes wildcard and literal alternatives', () => {
		const filterNode = booleanNode(
			'or',
			{ type: 'lucene-field' as const, field: 'author', ...textPredicate('wildcard', 'Alice*') },
			{ type: 'lucene-field' as const, field: 'author', ...textPredicate('literal', 'Bob?') },
		);

		expect(compileQueryIR(queryIR({ filter: filterNode })).filter).toBe(String.raw`author:(/Alice.*|Bob\?/)`);
	});

	test('date controller composes structured range nodes across bifields', () => {
		const contribution = filterDateController.getQueryContribution(
			{
				kind: 'field',
				id: 'publication-period',
				displayName: 'Publication period',
				fromField: 'startYear',
				toField: 'endYear',
				range: true,
			},
			context,
			{
				startDate: { y: '2020', m: '', d: '' },
				endDate: { y: '2021', m: '', d: '' },
				mode: 'permissive',
			},
		)!;

		expect(contribution.filter).toEqual(booleanNode('or', filterRange('startYear', '20200101', '20211231')!, filterRange('endYear', '20200101', '20211231')!));
	});

	test('Lucene emission preserves an OR of bifield date ranges', () => {
		const filterNode = booleanNode('or', filterRange('startYear', '20200101', '20211231')!, filterRange('endYear', '20200101', '20211231')!);

		expect(compileQueryIR(queryIR({ filter: filterNode })).filter).toBe('(startYear:[20200101 TO 20211231] OR endYear:[20200101 TO 20211231])');
	});

	test('date controller summarizes partial-year ranges', () => {
		const contribution = filterDateController.getQueryContribution(
			{
				kind: 'field',
				id: 'publication-period',
				displayName: 'Publication period',
				fromField: 'startYear',
				toField: 'endYear',
				range: true,
			},
			context,
			{
				startDate: { y: '2020', m: '', d: '' },
				endDate: { y: '2021', m: '', d: '' },
				mode: 'permissive',
			},
		)!;

		expect(contribution.summaries).toEqual([expect.objectContaining({ value: '2020-00-00 - 2021-00-00' })]);
	});

	test('empty radio selection contributes no query', () => {
		const config = {
			kind: 'field' as const,
			id: 'genre',
			displayName: 'Genre',
			metadataFieldId: 'genre',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
			],
		};

		expect(filterRadioController.getQueryContribution(config, context, '')).toBeNull();
	});

	test('select values containing only whitespace contribute no query', () => {
		const config = {
			kind: 'field' as const,
			id: 'genre',
			displayName: 'Genre',
			metadataFieldId: 'genre',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
			],
		};

		expect(filterSelectController.getQueryContribution(config, context, ['', '  '])).toBeNull();
	});

	test('select controller removes blank values before creating its filter', () => {
		const config = {
			kind: 'field' as const,
			id: 'genre',
			displayName: 'Genre',
			metadataFieldId: 'genre',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
			],
		};

		const contribution = filterSelectController.getQueryContribution(config, context, ['', 'fiction', '  '])!;
		expect(contribution.filter).toEqual(filter('genre', 'literal', 'fiction'));
	});

	test('select controller summarizes selected option labels', () => {
		const config = {
			kind: 'field' as const,
			id: 'genre',
			displayName: 'Genre',
			metadataFieldId: 'genre',
			options: [
				{ value: 'fiction', label: 'Fiction' },
				{ value: 'essay', label: 'Essay' },
			],
		};
		const contribution = filterSelectController.getQueryContribution(config, context, ['fiction'])!;

		expect(contribution.summaries).toEqual([expect.objectContaining({ value: 'Fiction' })]);
	});

	test('Pre-escaped quotes are preserved and do not suppress tokenization', () => {
		const compiled = compileValueForAnnotation('word', String.raw`sentence with \"pre-escaped quotes\"`, true);
		const expected = String.raw`[word="(?-i)sentence"] [word="(?-i)with"] [word="(?-i)\"pre-escaped"] [word="(?-i)quotes\""]`;

		expect(compiled).toBe(expected);
	});

	test('Combines multiple text controllers per-token', () => {
		const compiled = compileQueryIR(combineQueries([contribForAnnotation('lemma', 'example sentence', true), contribForAnnotation('word', 'example sentence', true)], 'and')).patt;

		const expected = String.raw`[lemma="(?-i)example" & word="(?-i)example"] [lemma="(?-i)sentence" & word="(?-i)sentence"]`;
		expect(compiled).toBe(expected);
	});

	test('Combines multiple text controllers per-token with trailing unmatched tokens', () => {
		const compiled = compileQueryIR(combineQueries([contribForAnnotation('word', 'a b', true), contribForAnnotation('lemma', 'c d e', true)], 'and')).patt;

		const expected = String.raw`[word="(?-i)a" & lemma="(?-i)c"] [word="(?-i)b" & lemma="(?-i)d"] [lemma="(?-i)e"]`;
		expect(compiled).toBe(expected);
	});

	test('Combines or text controllers per-token', () => {
		const compiled = compileQueryIR(combineQueries([contribForAnnotation('word', 'a b', true), contribForAnnotation('lemma', 'c d e', true)], 'or')).patt;

		const expected = String.raw`[word="(?-i)a" | lemma="(?-i)c"] [word="(?-i)b" | lemma="(?-i)d"] [lemma="(?-i)e"]`;
		expect(compiled).toBe(expected);
	});

	const combiners = [
		{
			mode: 'and' as const,
			insert: '&',
		},
		{
			mode: 'or' as const,
			insert: '|',
		},
	];
	test.each(combiners)('Simplifies matching token joiners while combining per-token conditions: $mode', ({ mode, insert }) => {
		const compiled = compileQueryIR(
			combineQueries(
				[queryIR({ pattern: booleanNode(mode, annotation('word', 'wildcard', 'a')!, annotation('word', 'wildcard', 'b')!) }), queryIR({ pattern: annotation('lemma', 'wildcard', 'c') })],
				mode,
			),
		);

		const expected = mode === 'or' ? `[word="a|b" | lemma="c"]` : `[word="a" ${insert} word="b" ${insert} lemma="c"]`;
		expect(compiled.patt).toBe(expected);
	});

	test('Preserves precedence when combining or per-token conditions with different joiners', () => {
		const compiled = compileQueryIR(
			combineQueries(
				[queryIR({ pattern: booleanNode('and', annotation('word', 'wildcard', 'a')!, annotation('word', 'wildcard', 'b')!) }), queryIR({ pattern: annotation('lemma', 'wildcard', 'c') })],
				'or',
			),
		).patt;

		const expected = String.raw`[(word="a" & word="b") | lemma="c"]`;
		expect(compiled).toBe(expected);
	});

	test('Preserves precedence when combining per-token conditions with different joiners', () => {
		const compiled = compileQueryIR(
			combineQueries(
				[queryIR({ pattern: booleanNode('or', annotation('word', 'wildcard', 'a')!, annotation('word', 'wildcard', 'b')!) }), queryIR({ pattern: annotation('lemma', 'wildcard', 'c') })],
				'and',
			),
		).patt;

		const expected = String.raw`[word="a|b" & lemma="c"]`;
		expect(compiled).toBe(expected);
	});

	test('Preserves mixed-target predicate grouping', () => {
		const compiled = compileQueryIR(
			queryIR({
				pattern: booleanNode('or', annotation('word', 'wildcard', 'koe')!, booleanNode('and', annotation('lemma', 'wildcard', 'kip')!, annotation('word', 'wildcard', 'kip')!)!),
			}),
		).patt;

		expect(compiled).toBe('[word="koe" | (lemma="kip" & word="kip")]');
	});

	test('merges adjacent compatible token values into one regex predicate', () => {
		const simplified = simplifyQueryIR(
			queryIR({
				pattern: booleanNode('or', annotation('word', 'literal', 'a|b')!, annotation('word', 'wildcard', 'c*')!, annotation('word', 'wildcard', String.raw`d\*`)!),
			}),
		).pattern;

		expect(simplified).toEqual(annotation('word', 'regex', String.raw`a\|b|c.*|d\*`));
	});

	test('does not merge explicit regex predicates with literal predicates', () => {
		const pattern = booleanNode('or', annotation('word', 'literal', 'a')!, annotation('word', 'regex', 'e.*')!);

		expect(simplifyQueryIR(queryIR({ pattern })).pattern).toEqual(pattern);
	});

	test('does not merge token predicates for different annotations', () => {
		const pattern = booleanNode('or', annotation('word', 'literal', 'a')!, annotation('lemma', 'literal', 'x')!);

		expect(simplifyQueryIR(queryIR({ pattern })).pattern).toEqual(pattern);
	});

	test('does not merge compatible token predicates separated by another annotation', () => {
		const pattern = booleanNode('or', annotation('word', 'literal', 'a')!, annotation('lemma', 'literal', 'x')!, annotation('word', 'literal', 'f')!);

		expect(simplifyQueryIR(queryIR({ pattern })).pattern).toEqual(pattern);
	});

	test('Normalizes CQL and Lucene alternatives to the same scalar regex value shape', () => {
		const simplified = simplifyQueryIR(
			queryIR({
				pattern: booleanNode('or', booleanNode('or', annotation('word', 'literal', 'a*')!, annotation('word', 'wildcard', 'b*')!)!, annotation('word', 'literal', 'c?')!),
				filter: booleanNode('or', filter('speaker', 'literal', 'A*')!, filter('speaker', 'wildcard', 'B*')!),
			}),
		);

		expect(simplified.pattern).toEqual(annotation('word', 'regex', String.raw`a\*|b.*|c\?`));
		expect(simplified.filter).toEqual({ type: 'lucene-field', field: 'speaker', ...textPredicate('regex', String.raw`A\*|B.*`) });
	});

	test('Keeps same-target token values with different comparison semantics separate', () => {
		const compiled = compileQueryIR(
			queryIR({
				pattern: booleanNode(
					'or',
					annotation('word', 'literal', 'a', { caseSensitive: true })!,
					annotation('word', 'literal', 'b', { caseSensitive: false })!,
					annotation('word', 'literal', 'c', { caseSensitive: false, operator: '!=' })!,
				),
			}),
		).patt;

		expect(compiled).toBe('[word=l"(?-i)a" | word=l"(?i)b" | word!=l"(?i)c"]');
	});

	test('Bashes compatible negative token predicates under AND', () => {
		const options = { caseSensitive: true, operator: '!=' as const };
		const compiled = compileQueryIR(
			queryIR({
				pattern: booleanNode('and', annotation('word', 'literal', 'a', options)!, annotation('word', 'wildcard', 'b*', options)!),
			}),
		).patt;

		expect(compiled).toBe('[word!="(?-i)a|b.*"]');
	});

	test('Bashes only adjacent compatible Lucene values for the same field', () => {
		const compiled = compileQueryIR(
			queryIR({
				filter: booleanNode('or', filter('author', 'literal', 'A|B')!, filter('author', 'wildcard', 'C*')!, filter('title', 'literal', 'D')!, filter('author', 'literal', 'E')!),
			}),
		).filter;

		expect(compiled).toBe(String.raw`(author:(/A\|B|C.*/) OR title:(D) OR author:(E))`);
	});

	test('Simplifies matching CQL pattern joiners', () => {
		const compiled = compileQueryIR(
			queryIR({
				pattern: booleanNode('and', rawCql('[word="a"]'), booleanNode('and', rawCql('[lemma="b"]'), rawCql('[pos="N"]'))!),
			}),
		).patt;

		expect(compiled).toBe('([word="a"] & [lemma="b"] & [pos="N"])');
	});

	test('Simplifies matching filter joiners', () => {
		const compiled = compileQueryIR(
			queryIR({
				filter: booleanNode('and', filter('author', 'literal', 'alice')!, booleanNode('and', filter('title', 'literal', 'water')!, filter('year', 'literal', '2020')!)!),
			}),
		).filter;

		expect(compiled).toBe('(author:(alice) AND title:(water) AND year:(2020))');
	});

	test('Preserves searchfield-only query fragments', () => {
		const compiled = compileQueryIR(queryFragment({ searchfield: 'contents__nl' })!);

		expect(compiled).toEqual({
			patt: null,
			filter: null,
			searchfield: 'contents__nl',
		});
	});

	test('combines result-preset-only query fragments', () => {
		const combined = combineQueries(
			[queryFragment({ resultPreset: { viewedResults: 'docs', sort: null } })!, queryFragment({ resultPreset: { groupBy: ['field:date'], groupDisplayMode: 'tokens', withSpans: true } })!],
			'and',
		);

		expect(combined.resultPreset).toEqual({
			viewedResults: 'docs',
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: null,
			withSpans: true,
		});
	});

	test('preserves a result-preset-only query during compilation', () => {
		const query = queryFragment({
			resultPreset: {
				viewedResults: 'docs',
				groupBy: ['field:date'],
				groupDisplayMode: 'tokens',
				sort: null,
				withSpans: true,
			},
		})!;

		expect(compileQueryIR(query)).toEqual({
			patt: null,
			filter: null,
			searchfield: null,
			resultPreset: {
				viewedResults: 'docs',
				groupBy: ['field:date'],
				groupDisplayMode: 'tokens',
				sort: null,
				withSpans: true,
			},
		});
	});

	const wildcardValues = (...values: string[]) =>
		booleanNode(
			'or',
			values.map(value => textPredicate('wildcard', value)),
		);

	test('merges within attributes by element and overlaps distinct elements', () => {
		const query = queryIR({
			pattern: rawCql('[word="water"]'),
			wrappers: [within('speech', { person: wildcardValues('Alice*')! }), within('speech', { role: wildcardValues('host', 'guest')! }), within('p', { n: rangePredicate('3', '5') })],
		});

		expect(simplifyQueryIR(query).wrappers).toEqual([
			within('speech', { person: wildcardValues('Alice*')!, role: textPredicate('regex', 'host|guest') }),
			within('p', { n: rangePredicate('3', '5') }),
		]);
		expect(compileQueryIR(query).patt).toBe('([word="water"]) within <speech person="Alice.*" role="host|guest"/> overlap <p n=in[3,5]/>');
	});

	test('emits CQL-safe values, open ranges, and empty tags', () => {
		expect(
			compileQueryIR(
				queryIR({
					wrappers: [within('speech', { person: wildcardValues('A"B', 'C?')! }), within('p', { n: rangePredicate(undefined, '5') }), within('div')],
				}),
			).patt,
		).toBe(String.raw`<speech person="A\\"B|C."/> overlap <p n=in[0,5]/> overlap <div/>`);
	});

	test('emits shared literal, wildcard, and regex value intent for CQL and Lucene', () => {
		const values = [textPredicate('literal', 'A*'), textPredicate('wildcard', 'B*'), textPredicate('wildcard', String.raw`D\*`), textPredicate('regex', 'C/.+')];
		const alternatives = booleanNode('or', values)!;

		expect(
			compileQueryIR(
				queryIR({
					filter: booleanNode('or', filter('speaker', 'literal', 'A*')!, filter('speaker', 'wildcard', ['B*', String.raw`D\*`])!, filter('speaker', 'regex', 'C/.+')!),
				}),
			).filter,
		).toBe(String.raw`(speaker:(/A\*|B.*|D\*/) OR speaker:(/C\/.+/))`);
		expect(
			compileQueryIR(
				queryIR({
					wrappers: within('speech', { person: alternatives }),
				}),
			).patt,
		).toBe(String.raw`<speech (person="A\*|B.*|D\*" | person="C/.+")/>`);
	});

	const parallelField = {
		id: 'parallel',
		kind: 'field' as const,
		fieldOptions: [
			{ id: 'contents__en', defaultDisplayName: 'English' },
			{ id: 'contents__nl', defaultDisplayName: 'Dutch' },
			{ id: 'contents__de', defaultDisplayName: 'German' },
		],
		alignByOptions: ['word-alignment'],
		childFieldTemplate: createFormFieldNode('parallel.query', expertQueryController, RawCqlField, {}),
	};

	test('Parallel wrapper emits a source-only query in the selected source field', () => {
		const compiled = compileQueryIR(
			parallelController.getQueryContribution(parallelField, context, {
				source: 'contents__en',
				targets: [],
				alignBy: 'word-alignment',
				childStates: {
					contents__en: '[lemma="test"]',
				},
			})!,
		);

		expect(compiled).toEqual({
			patt: '[lemma="test"]',
			filter: null,
			searchfield: 'contents__en',
		});
	});

	test('Parallel wrapper emits relation syntax for source plus one target', () => {
		const compiled = compileQueryIR(
			parallelController.getQueryContribution(parallelField, context, {
				source: 'contents__en',
				targets: ['contents__nl'],
				alignBy: 'word-alignment',
				childStates: {
					contents__en: '[lemma="test"]',
					contents__nl: '[lemma="proef"]',
				},
			})!,
		);

		expect(compiled.patt).toBe('[lemma="test"] =word-alignment=>nl? [lemma="proef"]');
		expect(compiled.searchfield).toBe('contents__en');
	});

	test('Parallel wrapper joins multiple target relations', () => {
		const compiled = compileQueryIR(
			parallelController.getQueryContribution(parallelField, context, {
				source: 'contents__en',
				targets: ['contents__nl', 'contents__de'],
				alignBy: 'word-alignment',
				childStates: {
					contents__en: '[lemma="test"]',
					contents__nl: '[lemma="proef"]',
					contents__de: '[lemma="test"]',
				},
			})!,
		);

		expect(compiled.patt).toBe('[lemma="test"] =word-alignment=>nl? [lemma="proef"] ; =word-alignment=>de? [lemma="test"]');
	});

	test('Parallel wrapper defaults empty source and target parts to underscore placeholders', () => {
		const compiled = compileQueryIR(
			parallelController.getQueryContribution(parallelField, context, {
				source: 'contents__en',
				targets: ['contents__nl'],
				alignBy: 'word-alignment',
				childStates: {
					contents__en: '',
					contents__nl: '',
				},
			})!,
		);

		expect(compiled.patt).toBe('_ =word-alignment=>nl? _');
	});
});
