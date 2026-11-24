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
	test('normalizes v4 window and fixed sample into the v5 shape', () => {
		const results = normalizeDocResponse({
			docs: [],
			summary: {
				searchParam: { first: 20, number: 10 },
				docFields: {} as never,
				windowFirstResult: 20,
				requestedWindowSize: 10,
				actualWindowSize: 3,
				windowHasPrevious: true,
				windowHasNext: false,
				searchTime: 10,
				numberOfDocs: 23,
				numberOfDocsRetrieved: 23,
				stillCounting: false,
				sampleSeed: 42,
				sampleSize: 23,
			},
		});

		expect(results.summary.results.window).toEqual({ firstResult: 20, requestedSize: 10, actualSize: 3, hasPrevious: true, hasNext: false });
		expect(results.summary.results.sample).toEqual({ size: 23, seed: 42 });
		expect(results.summary.results.stats.counted.documents).toBe(23);
	});

	test('preserves v5 results without a window or sample', () => {
		const stats = { status: 'finished' as const, hits: 0, documents: 0, timeMs: 10, stoppedBecauseTooMany: false };
		const summary = { params: { first: 0, number: 0 }, results: { stats: { processed: stats, counted: stats, subcorpusSize: { documents: 0, tokens: 0 } } } };
		expect(normalizeDocResponse({ docs: [], summary }).summary).toEqual(summary);
	});
});
