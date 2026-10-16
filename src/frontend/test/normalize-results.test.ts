import { describe, expect, test } from 'vitest';

import { normalizeDoc, normalizeDocResponse } from '@/shared/blacklab-helpers/normalize/normalize-results';

describe('normalizeDoc', () => {
	test('preserves native v5 document information', () => {
		const docInfo = {
			metadata: {},
			mayView: true,
			tokenCounts: [
				{ fieldName: 'contents', tokens: 269 },
				{ fieldName: 'translation', tokens: 300 },
			],
		};
		expect(normalizeDoc({ docPid: 'bab0954', docInfo }).docInfo).toEqual(docInfo);
	});

	test('normalizes v4 per-field counts and the legacy main-field length', () => {
		const docInfo = { title: ['Test'], mayView: true, lengthInTokens: 269 };
		const legacy = normalizeDoc({ docPid: 'doc', docInfo });
		const parallel = normalizeDoc({
			docPid: 'doc',
			docInfo: {
				...docInfo,
				tokenCounts: [
					{ fieldName: 'contents', tokenCount: 269 },
					{ fieldName: 'translation', tokenCount: 300 },
				],
			},
		});
		expect(legacy.docInfo.tokenCounts).toEqual([{ fieldName: '', tokens: 269 }]);
		expect(parallel.docInfo.tokenCounts).toEqual([
			{ fieldName: 'contents', tokens: 269 },
			{ fieldName: 'translation', tokens: 300 },
		]);
		expect(parallel.docInfo.metadata).toEqual({ title: ['Test'] });
		const namedMetadata = normalizeDoc({ docPid: 'doc', docInfo: { ...docInfo, metadata: ['A metadata field named metadata'] } });
		expect(namedMetadata.docInfo.tokenCounts).toEqual([{ fieldName: '', tokens: 269 }]);
		expect(namedMetadata.docInfo.metadata.metadata).toEqual(['A metadata field named metadata']);
	});
});

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
