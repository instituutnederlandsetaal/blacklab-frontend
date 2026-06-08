// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

import { annotationTextController, booleanExpr, type FieldControllerProps, type FormRuntimeContext, type QueryFragment } from '@/features/form';
import { combineQueryFragments, compileQueryIR, cqlRaw, queryFragment, queryIR, rawFilter, termFilter, token, tokenPredicate } from '@/features/form/model/compile/query-artifact';
import type { AnnotationTextFieldConfig } from '@/features/form/model/controllers/annotation-controller';

import { createMockTranslate } from '@/shared/i18n/mock';

describe('generated query correctness', () => {
	const context: FormRuntimeContext = {
		corpus: { indexId: '', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};

	function contribForAnnotation(annotId: string, value: string, caseSensitive = false): QueryFragment {
		const field: FieldControllerProps<AnnotationTextFieldConfig> = {
			annotationId: annotId,
			displayName: '',
			id: annotId,
			kind: 'field',
		};

		return annotationTextController.getQueryContribution!(field, context, {
			caseSensitive,
			value,
		});
	}

	function compileValueForAnnotation(annotId: string, value: string, caseSensitive = false) {
		return compileQueryIR(contribForAnnotation(annotId, value, caseSensitive).query).patt;
	}

	test('Text field controller tokenizes input and treats wildcards correctly', () => {
		const compiled = compileValueForAnnotation('lemma', `"this is" a?|example sentence* `, false);
		const expected = [`[lemma="(?i)this is"]`, `[lemma="(?i)a.|example"]`, `[lemma="(?i)sentence.*"]`].join(' ');

		expect(compiled).toBe(expected);
	});

	test('Text field controller handles escaped wildcards correctly', () => {
		const compiled = compileValueForAnnotation('lemma', String.raw`a\*b c\?d e\\f`, true);
		const expected = String.raw`[lemma="a\*b"] [lemma="c\?d"] [lemma="e\\\\f"]`;

		expect(compiled).toBe(expected);
	});

	test('Pre-escaped quotes are preserved and do not suppress tokenization', () => {
		const compiled = compileValueForAnnotation('word', String.raw`sentence with \"pre-escaped quotes\"`, true);
		const expected = String.raw`[word="sentence"] [word="with"] [word="\"pre-escaped"] [word="quotes\""]`;

		expect(compiled).toBe(expected);
	});

	test('Combines multiple text controllers per-token', () => {
		const compiled = compileQueryIR(combineQueryFragments('and', contribForAnnotation('lemma', 'example sentence', true), contribForAnnotation('word', 'example sentence', true)).query).patt;

		const expected = String.raw`[lemma="example" & word="example"] [lemma="sentence" & word="sentence"]`;
		expect(compiled).toBe(expected);
	});

	test('Combines multiple text controllers per-token with trailing unmatched tokens', () => {
		const compiled = compileQueryIR(combineQueryFragments('and', contribForAnnotation('word', 'a b', true), contribForAnnotation('lemma', 'c d e', true)).query).patt;

		const expected = String.raw`[word="a" & lemma="c"] [word="b" & lemma="d"] [lemma="e"]`;
		expect(compiled).toBe(expected);
	});

	test('Combines or text controllers per-token', () => {
		const compiled = compileQueryIR(combineQueryFragments('or', contribForAnnotation('word', 'a b', true), contribForAnnotation('lemma', 'c d e', true)).query).patt;

		const expected = String.raw`[word="a" | lemma="c"] [word="b" | lemma="d"] [lemma="e"]`;
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
			combineQueryFragments(
				mode,
				queryFragment(token(booleanExpr(mode, tokenPredicate('wildcard', 'word', 'a', true), tokenPredicate('wildcard', 'word', 'b', true)))),
				queryFragment(token(tokenPredicate('wildcard', 'lemma', 'c', true))),
			).query,
		);

		const expected = `[word="a" ${insert} word="b" ${insert} lemma="c"]`;
		expect(compiled.patt).toBe(expected);
	});

	test('Preserves precedence when combining or per-token conditions with different joiners', () => {
		const compiled = compileQueryIR(
			combineQueryFragments(
				'or',
				queryFragment(token(booleanExpr('and', tokenPredicate('wildcard', 'word', 'a', true), tokenPredicate('wildcard', 'word', 'b', true)))),
				queryFragment(token(tokenPredicate('wildcard', 'lemma', 'c', true))),
			).query,
		).patt;

		const expected = String.raw`[(word="a" & word="b") | lemma="c"]`;
		expect(compiled).toBe(expected);
	});

	test('Preserves precedence when combining per-token conditions with different joiners', () => {
		const compiled = compileQueryIR(
			combineQueryFragments(
				'and',
				queryFragment(token(booleanExpr('or', tokenPredicate('wildcard', 'word', 'a', true), tokenPredicate('wildcard', 'word', 'b', true)))),
				queryFragment(token(tokenPredicate('wildcard', 'lemma', 'c', true))),
			).query,
		).patt;

		const expected = String.raw`[(word="a" | word="b") & lemma="c"]`;
		expect(compiled).toBe(expected);
	});

	test('Simplifies matching CQL pattern joiners', () => {
		const compiled = compileQueryIR(
			queryIR({
				pattern: booleanExpr('and', cqlRaw('[word="a"]')!, booleanExpr('and', cqlRaw('[lemma="b"]')!, cqlRaw('[pos="N"]')!)),
			}),
		).patt;

		expect(compiled).toBe('([word="a"] & [lemma="b"] & [pos="N"])');
	});

	test('Simplifies matching filter joiners', () => {
		const compiled = compileQueryIR(
			queryIR({
				filter: booleanExpr('and', termFilter('author', ['alice'])!, booleanExpr('and', termFilter('title', ['water'])!, rawFilter(' year:2020 ')!)),
			}),
		).filter;

		expect(compiled).toBe('(author:(alice) AND title:(water) AND year:2020)');
	});
});
