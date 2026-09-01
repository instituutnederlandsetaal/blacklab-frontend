import { describe, expect, test } from 'vitest';

import { collocationController, type Emit, type FormEmission, type SummaryInput } from '@/features/form';
import type { CollocationFieldState } from '@/features/form/fields/collocation-field';

import { createTestContext } from './helpers';

const runtime = createTestContext();
const config = {
	kind: 'field' as const,
	id: 'collocations.controls',
	defaultAnnotation: 'word',
	annotationOptions: [],
} as Parameters<typeof collocationController.createDefaultState>[0];

function state(overrides: Partial<CollocationFieldState> = {}): CollocationFieldState {
	return { ...collocationController.createDefaultState(config, runtime), ...overrides };
}

function collect(value: CollocationFieldState): FormEmission[] {
	const emissions: FormEmission[] = [];
	collocationController.collect(config, runtime, value, ((name, output) => {
		emissions.push({ name, value: output } as FormEmission);
	}) as Emit);
	return emissions;
}

describe('collocation controller', () => {
	test('provides complete proximity defaults and the grouped table preset', () => {
		expect(state()).toEqual({
			patt: '',
			collpatt: '',
			colltype: 'proximity',
			context: '5',
			within: '',
			reltype: '',
			annotation: 'word',
			sensitive: false,
			scorertype: 'coll-dice',
		});
		expect(collocationController.getResultPreset?.(config, runtime, state())).toBe('table');
	});

	test('emits one normalized proximity batch with separate patterns and a context tuple', () => {
		expect(
			collect(
				state({
					patt: ' [word="ship"] ',
					collpatt: ' [lemma="boat"] ',
					context: '3:4',
					within: ' s ',
					reltype: 'ignored',
					annotation: ' lemma ',
					sensitive: true,
					scorertype: ' coll-salience ',
				}),
			),
		).toEqual([
			{ name: 'patt', value: { type: 'cql-raw', cql: '[word="ship"]' } },
			{ name: 'collpatt', value: { type: 'cql-raw', cql: '[lemma="boat"]' } },
			{ name: 'colltype', value: 'proximity' },
			{ name: 'context', value: [3, 4] },
			{ name: 'within', value: 's' },
			{ name: 'annotation', value: 'lemma' },
			{ name: 'sensitive', value: true },
			{ name: 'scorertype', value: 'coll-salience' },
		]);
	});

	test('parses a symmetric context as a number', () => {
		expect(collect(state({ patt: '[word="ship"]', context: '5' }))).toContainEqual({ name: 'context', value: 5 });
	});

	test.each(['', '-1', '3:', '3:4:5', String(Number.MAX_SAFE_INTEGER + 1)])('emits nothing for invalid proximity context %j', context => {
		expect(collect(state({ patt: '[word="ship"]', collpatt: '[lemma="boat"]', context }))).toEqual([]);
	});

	test('emits only relation-applicable values for a persisted relation mode', () => {
		expect(collect(state({ patt: '[word="ship"]', colltype: 'relsources', context: 'invalid', within: 's', reltype: ' aligns ' }))).toEqual([
			{ name: 'patt', value: { type: 'cql-raw', cql: '[word="ship"]' } },
			{ name: 'colltype', value: 'relsources' },
			{ name: 'reltype', value: 'aligns' },
			{ name: 'annotation', value: 'word' },
			{ name: 'sensitive', value: false },
			{ name: 'scorertype', value: 'coll-dice' },
		]);
	});

	test('assigns every user-facing summary to its semantic output', () => {
		const summaries: SummaryInput[] = [];
		collocationController.summarize?.(config, runtime, state({ patt: '[word="ship"]', collpatt: '[lemma="boat"]', annotation: 'lemma' }), summary => summaries.push(summary));

		expect(summaries).toEqual([
			{ label: 'collocations.keywordPattern', value: '[word="ship"]', summaryType: ['patt'], group: undefined },
			{ label: 'collocations.collocatePattern', value: '[lemma="boat"]', summaryType: ['collpatt'], group: undefined },
			{ label: 'collocations.type', value: 'collocations.types.proximity', summaryType: ['colltype'], group: undefined },
			{ label: 'collocations.annotation', value: 'lemma', summaryType: ['annotation'], group: undefined },
		]);
	});
});
