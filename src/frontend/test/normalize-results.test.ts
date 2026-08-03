import { describe, expect, test } from 'vitest';

import { normalizeDocResponse } from '@/shared/blacklab-helpers/normalize/normalize-results';

describe('normalizeDocResponse', () => {
	test('normalizes legacy v5 totals when no documents match', () => {
		const results = normalizeDocResponse({
			docs: [],
			summary: {
				params: { filter: 'bookName:("1 John")', first: 0, number: 0 },
				resultWindow: {
					firstResult: 0,
					requestedSize: 0,
					actualSize: 0,
					hasPrevious: false,
					hasNext: false,
				},
				resultsStats: {
					status: 'finished',
					hits: 0,
					documents: 0,
					timeMs: 10,
					subcorpusSize: { documents: 0, tokens: 0 },
				},
			},
		} as never);

		expect(results.summary.results.stats.counted.documents).toBe(0);
		expect(results.summary.results.stats.subcorpusSize).toEqual({ documents: 0, tokens: 0 });
	});
});
