import { describe, expect, test } from 'vitest';

import { frequencyAnnotationController, ngramGroupAnnotationController, type AnyFieldController, type FormEmission, type SummaryInput } from '@/features/form';

import { createTestContext } from './helpers';

const runtime = createTestContext();
const config = {
	annotationLabels: { lemma: () => 'Localized lemma' },
	defaultAnnotationId: 'lemma',
	displayName: () => 'Annotation',
	groupId: 'Explore',
	id: 'annotation',
	kind: 'field',
	options: [
		{ value: 'word', label: () => 'Word option' },
		{ value: 'lemma', label: 'Lemma option' },
	],
	persistKey: 'annotation',
} as const;

function collect(controller: AnyFieldController, state: string): FormEmission[] {
	const emissions: FormEmission[] = [];
	controller.collect(config as never, runtime, state, (name, value) => emissions.push({ name, value } as FormEmission));
	return emissions;
}

function summarize(controller: AnyFieldController, state: string): SummaryInput[] {
	const summaries: SummaryInput[] = [];
	controller.summarize?.(config as never, runtime, state, summary => summaries.push(summary));
	return summaries;
}

describe('Explore annotation controllers', () => {
	test('keep distinct kinds and mode-specific outputs', () => {
		expect(frequencyAnnotationController).not.toBe(ngramGroupAnnotationController);
		expect(frequencyAnnotationController.kind).toBe('explore-frequency-annotation');
		expect(ngramGroupAnnotationController.kind).toBe('explore-ngram-group-annotation');
		expect(frequencyAnnotationController.outputs).toEqual(['patt', 'group']);
		expect(ngramGroupAnnotationController.outputs).toEqual(['group']);
	});

	test.each([frequencyAnnotationController, ngramGroupAnnotationController])('uses a configured default and falls back from stale or absent selections', controller => {
		expect(controller.createDefaultState(config as never, runtime)).toBe('lemma');
		expect(controller.createDefaultState({ ...config, defaultAnnotationId: 'removed' } as never, runtime)).toBe('word');
		expect(controller.createDefaultState({ ...config, defaultAnnotationId: null, options: [] } as never, runtime)).toBe('');
		expect(controller.persistence.codec.decode(null, { config: config as never, runtime })).toBe('lemma');
	});

	test('emits the frequency pattern before its exact hit grouping', () => {
		expect(collect(frequencyAnnotationController, 'lemma')).toEqual([
			{ name: 'patt', value: { type: 'cql-any-token' } },
			{ name: 'group', value: ['hit:lemma'] },
		]);
		expect(collect(frequencyAnnotationController, '')).toEqual([]);
	});

	test('emits only the exact hit grouping for N-grams', () => {
		expect(collect(ngramGroupAnnotationController, 'word')).toEqual([{ name: 'group', value: ['hit:word'] }]);
		expect(collect(ngramGroupAnnotationController, '')).toEqual([]);
	});

	test('keeps frequency-only summary grouping and resolves annotation labels before option labels', () => {
		expect(summarize(frequencyAnnotationController, 'lemma')).toEqual([{ label: 'Annotation', summaryType: ['patt'], group: 'Explore', value: 'Localized lemma' }]);
		expect(summarize(ngramGroupAnnotationController, 'word')).toEqual([{ label: 'Annotation', summaryType: ['patt'], value: 'Word option' }]);
		expect(summarize(frequencyAnnotationController, '')).toEqual([]);
		expect(summarize(ngramGroupAnnotationController, '')).toEqual([]);
	});

	test('retains distinct stale persistence diagnostics', () => {
		const context = { config: config as never, runtime };
		expect(() => frequencyAnnotationController.persistence.codec.decode('removed', context)).toThrow("Cannot restore frequency annotation 'removed' because it is not present in the current options.");
		expect(() => ngramGroupAnnotationController.persistence.codec.decode('removed', context)).toThrow(
			"Cannot restore n-gram grouping annotation 'removed' because it is not present in the current options.",
		);
	});
});
