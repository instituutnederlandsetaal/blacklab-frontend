import { describe, expect, test } from 'vitest';

import type { CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import { collocationController, createFormFieldNode, expertQueryController, queryBuilderController, type Emit, type FormEmission, type SummaryInput } from '@/features/form';
import type { CollocationFieldState } from '@/features/form/fields/collocation-field';

import { createTestContext, testTextController, TestTextField } from './helpers';

import QueryBuilderField from '@/features/form/fields/QueryBuilderField.vue';
import RawCqlField from '@/features/form/fields/RawCqlField.vue';

const runtime = createTestContext();
const queryBuilderOptions = {
	indexId: 'test-corpus',
	defaultAnnotationId: 'word',
	textDirection: 'ltr',
	allAnnotationsMap: {},
	annotationOptions: [{ value: 'word', label: 'Word' }],
	operatorOptions: [],
	comparatorOptions: [],
	autocomplete: async () => [],
} as CqlQueryBuilderOptions;
const advancedField = createFormFieldNode('collocations.advanced', queryBuilderController, QueryBuilderField, { options: queryBuilderOptions });
const expertField = createFormFieldNode('collocations.expert', expertQueryController, RawCqlField, { hideLabel: true });
const config = {
	kind: 'field' as const,
	id: 'collocations.controls',
	defaultAnnotation: 'word',
	annotationOptions: [
		{ value: 'word', label: () => 'Word' },
		{ value: 'lemma', label: () => 'Lemma' },
	],
	createAnnotationField: ({ id, annotationId }: { id: string; annotationId: string }) => createFormFieldNode(id, testTextController, TestTextField, { annotationId, displayName: annotationId }),
	advancedField,
	expertField,
	withinOptions: [],
	defaultWithin: '',
	parsePattern: async () => null,
} as Parameters<typeof collocationController.createDefaultState>[0];

function state(overrides: Partial<CollocationFieldState> = {}): CollocationFieldState {
	return { ...collocationController.createDefaultState(config, runtime), ...overrides };
}

function withExpertPatterns(keyword: string, collocate = ''): CollocationFieldState {
	const value = state();
	return {
		...value,
		keyword: { ...value.keyword, mode: 'expert', expert: keyword },
		collocate: {
			enabled: !!collocate,
			pattern: { ...value.collocate.pattern, mode: 'expert', expert: collocate },
		},
	};
}

function collect(value: CollocationFieldState): FormEmission[] {
	const emissions: FormEmission[] = [];
	collocationController.collect(config, runtime, value, ((name, output) => {
		emissions.push({ name, value: output } as FormEmission);
	}) as Emit);
	return emissions;
}

describe('collocation controller', () => {
	test('provides structured proximity defaults and the grouped table preset', () => {
		const value = state();
		expect(value).toMatchObject({
			keyword: { mode: 'simple', simple: { annotationId: 'word' }, expert: '' },
			collocate: { enabled: false, pattern: { mode: 'simple', simple: { annotationId: 'word' }, expert: '' } },
			before: 5,
			after: 5,
			within: '',
			colltype: 'proximity',
			reltype: '',
			annotation: 'word',
			sensitive: false,
		});
		expect(collocationController.getResultPreset?.(config, runtime, value)).toBe('table');
	});

	test('emits expert keyword and collocate patterns with asymmetric context', () => {
		const value = withExpertPatterns(' [word="ship"] ', ' [lemma="boat"] ');
		expect(
			collect({
				...value,
				before: 3,
				after: 4,
				within: ' s ',
				reltype: 'ignored',
				annotation: ' lemma ',
				sensitive: true,
			}),
		).toEqual([
			{ name: 'patt', value: { type: 'cql-raw', cql: '[word="ship"]' } },
			{ name: 'collpatt', value: { type: 'cql-raw', cql: '[lemma="boat"]' } },
			{ name: 'colltype', value: 'proximity' },
			{ name: 'context', value: [3, 4] },
			{ name: 'within', value: 's' },
			{ name: 'annotation', value: 'lemma' },
			{ name: 'sensitive', value: true },
		]);
	});

	test('compiles annotation-aware simple patterns', () => {
		const value = state();
		value.keyword.simple.fieldState = { value: 'ship' };
		expect(collect(value)).toContainEqual({ name: 'patt', value: { type: 'cql-annotation', annotation: 'word', valueType: 'wildcard', value: 'ship' } });
	});

	test('emits a symmetric context as a number', () => {
		expect(collect(withExpertPatterns('[word="ship"]'))).toContainEqual({ name: 'context', value: 5 });
	});

	test.each([
		{ before: -1, after: 5 },
		{ before: 3.5, after: 5 },
		{ before: Number.MAX_SAFE_INTEGER + 1, after: 5 },
		{ before: 0, after: 0 },
	])('emits nothing for invalid proximity context $before:$after', ({ before, after }) => {
		expect(collect({ ...withExpertPatterns('[word="ship"]'), before, after })).toEqual([]);
	});

	test('emits only relation-applicable values for a restored relation mode', () => {
		expect(collect({ ...withExpertPatterns('[word="ship"]'), colltype: 'relsources', within: 's', reltype: ' aligns ' })).toEqual([
			{ name: 'patt', value: { type: 'cql-raw', cql: '[word="ship"]' } },
			{ name: 'colltype', value: 'relsources' },
			{ name: 'reltype', value: 'aligns' },
			{ name: 'annotation', value: 'word' },
			{ name: 'sensitive', value: false },
		]);
	});

	test('assigns readable summaries to their semantic outputs', () => {
		const summaries: SummaryInput[] = [];
		const value = { ...withExpertPatterns('[word="ship"]', '[lemma="boat"]'), annotation: 'lemma' };
		collocationController.summarize?.(config, runtime, value, summary => summaries.push(summary));

		expect(summaries).toEqual([
			{ label: 'collocations.keywordPattern', value: '[word="ship"]', summaryType: ['patt'], group: undefined },
			{ label: 'collocations.collocatePattern', value: '[lemma="boat"]', summaryType: ['collpatt'], group: undefined },
			{ label: 'collocations.context', value: 'L5/R5', summaryType: ['context'], group: undefined },
			{ label: 'collocations.annotation', value: 'Lemma', summaryType: ['annotation'], group: undefined },
		]);
	});

	test('describes an unrestricted collocate explicitly', () => {
		const summaries: SummaryInput[] = [];
		collocationController.summarize?.(config, runtime, withExpertPatterns('[word="ship"]'), summary => summaries.push(summary));

		expect(summaries).toContainEqual({
			label: 'collocations.collocates',
			value: 'collocations.anyCollocate',
			summaryType: ['collpatt'],
			group: undefined,
		});
	});
});
