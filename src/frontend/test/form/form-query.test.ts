// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';

import { annotationTextController, type FieldControllerProps, type FormRuntimeContext, type QueryContribution, type QueryPatternNode } from '@/features/form';
import { combineQueryContributions, createCompiledQueryProjections } from '@/features/form/model/compile/query-artifact';
import type { AnnotationTextFieldConfig } from '@/features/form/model/controllers/annotation-controller';

import { TestTextField, createTestBuilder, createTestContext, testTextController } from './helpers';

import { createMockTranslate } from '@/shared/i18n/mock';

import ContainerRenderer from '@/features/form/ui/ContainerRenderer.vue';

function createSingleTextForm() {
	const builder = createTestBuilder();
	const form = builder.newForm('search.extended', ContainerRenderer, { title: 'Extended', persistKey: 'extended' });
	const field = builder.newField('search.extended.word', testTextController, TestTextField, {
		annotationId: 'word',
		displayName: 'Word',
	});
	form.addChildren(field);
	return {
		context: createTestContext(),
		definition: builder.build(),
		field,
		form,
	};
}

describe('generated query correctness', () => {
	const context: FormRuntimeContext = {
		corpus: { indexId: '', textDirection: 'ltr' },
		translate: createMockTranslate(),
	};

	function contribForAnnotation(annotId: string, value: string, caseSensitive = false): QueryContribution {
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
		return createCompiledQueryProjections(contribForAnnotation(annotId, value, caseSensitive).query).cql;
	}

	function contribForPattern(pattern: QueryPatternNode): QueryContribution {
		return {
			query: {
				pattern,
				filter: null,
				searchField: null,
				wrappers: [],
			},
			summaries: [],
		};
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
		const compiled = createCompiledQueryProjections(
			combineQueryContributions('allOf', contribForAnnotation('lemma', 'example sentence', true), contribForAnnotation('word', 'example sentence', true)).query,
		).cql;

		const expected = String.raw`[lemma="example" & word="example"] [lemma="sentence" & word="sentence"]`;
		expect(compiled).toBe(expected);
	});

	test('Combines multiple text controllers per-token with trailing unmatched tokens', () => {
		const compiled = createCompiledQueryProjections(combineQueryContributions('allOf', contribForAnnotation('word', 'a b', true), contribForAnnotation('lemma', 'c d e', true)).query).cql;

		const expected = String.raw`[word="a" & lemma="c"] [word="b" & lemma="d"] [lemma="e"]`;
		expect(compiled).toBe(expected);
	});

	test('Simplifies matching token joiners while combining per-token conditions', () => {
		const compiled = createCompiledQueryProjections(
			combineQueryContributions(
				'allOf',
				contribForPattern({
					type: 'token',
					clauses: [
						{ type: 'wildcard', annotationId: 'word', value: 'a', caseSensitive: true },
						{ type: 'wildcard', annotationId: 'word', value: 'b', caseSensitive: true },
					],
				}),
				contribForPattern({
					type: 'token',
					clauses: [{ type: 'wildcard', annotationId: 'lemma', value: 'c', caseSensitive: true }],
				}),
			).query,
		).cql;

		const expected = String.raw`[word="a" & word="b" & lemma="c"]`;
		expect(compiled).toBe(expected);
	});

	test('Preserves precedence when combining per-token conditions with different joiners', () => {
		const compiled = createCompiledQueryProjections(
			combineQueryContributions(
				'allOf',
				contribForPattern({
					type: 'token',
					operator: 'or',
					clauses: [
						{ type: 'wildcard', annotationId: 'word', value: 'a', caseSensitive: true },
						{ type: 'wildcard', annotationId: 'word', value: 'b', caseSensitive: true },
					],
				}),
				contribForPattern({
					type: 'token',
					clauses: [{ type: 'wildcard', annotationId: 'lemma', value: 'c', caseSensitive: true }],
				}),
			).query,
		).cql;

		const expected = String.raw`[(word="a" | word="b") & lemma="c"]`;
		expect(compiled).toBe(expected);
	});
});
