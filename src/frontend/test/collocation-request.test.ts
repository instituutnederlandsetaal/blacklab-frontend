import { describe, expect, test } from 'vitest';

import { createCollocationHitsParameters } from '@/features/search/model/results/collocation-request';
import type { EffectiveCollocationParameters } from '@/features/search/model/results/result-types';

function parameters(overrides: Partial<EffectiveCollocationParameters> = {}): EffectiveCollocationParameters {
	return {
		annotation: 'word',
		colltype: 'proximity',
		context: 5,
		first: 0,
		number: 20,
		patt: '[lemma="boot"]',
		scorertype: 'coll-dice',
		sensitive: false,
		viewgroup: 'cws:contents%word:i:ship',
		...overrides,
	};
}

describe('createCollocationHitsParameters', () => {
	test('expands proximity collocations to the canonical all-hits request', () => {
		expect(
			createCollocationHitsParameters(
				parameters({
					collpatt: '[pos="N.*"]',
					context: '3:4',
					filter: 'author:Austen',
					field: 'contents',
					first: 40,
					number: 20,
					sample: 10,
					sampleseed: 37,
					sort: 'score',
				}),
			),
		).toEqual({
			context: '3:4',
			field: 'contents',
			filter: 'author:Austen',
			first: 40,
			hitfiltercrit: 'hit:word:i',
			hitfilterval: 'cws:contents%word:i:ship',
			number: 20,
			patt: 'meet([pos="N.*"], [lemma="boot"],-3,4)',
			sample: 10,
			sampleseed: 37,
		});
	});

	test.each([
		['0:4', 'meet([], [lemma="boot"],1,4)'],
		['3:0', 'meet([], [lemma="boot"],-3,-1)'],
		[0, 'meet([], [lemma="boot"],-1,1)'],
	] as const)('uses BlackLab one-sided and empty-window offset conventions for context %s', (context, patt) => {
		expect(createCollocationHitsParameters(parameters({ context }))?.patt).toBe(patt);
	});

	test('uses meet_within for a separate within clause and omits offsets for an inline-tag context', () => {
		expect(createCollocationHitsParameters(parameters({ context: 5, within: 's' }))?.patt).toBe('meet_within([], [lemma="boot"], <s/>,-5,5)');
		expect(createCollocationHitsParameters(parameters({ context: 's' }))?.patt).toBe('meet_within([], [lemma="boot"], <s/>)');
	});

	test('uses the selected annotation sensitivity and retains a hits-compatible sort', () => {
		expect(createCollocationHitsParameters(parameters({ annotation: 'lemma', sensitive: true, sort: '-before:word:s' }))).toMatchObject({
			hitfiltercrit: 'hit:lemma:s',
			sort: '-before:word:s',
		});
	});

	test.each(['identity', '-identity', 'size', '-size', 'score', '-score'])('does not forward collocation group sort %s to hits', sort => {
		expect(createCollocationHitsParameters(parameters({ sort }))).not.toHaveProperty('sort');
	});

	test('rejects requests without a selected group or with an invalid context', () => {
		expect(createCollocationHitsParameters(parameters({ viewgroup: undefined }))).toBeNull();
		expect(createCollocationHitsParameters(parameters({ context: '3:four' }))).toBeNull();
		expect(createCollocationHitsParameters(parameters({ context: -1 }))).toBeNull();
	});
});
