import { describe, expect, test } from 'vitest';

import { getArticlePagination } from '@/features/article/model/article-pagination';

describe('article word ranges', () => {
	test.each([
		{ input: {}, length: 246, expected: [0, 100, 0, 2] },
		{ input: { wordstart: 200, wordend: 300 }, length: 246, expected: [200, 246, 2, 2] },
		{ input: { wordstart: -20, wordend: -1 }, length: 246, expected: [0, 100, 0, 2] },
		{ input: { wordstart: 500, wordend: 600 }, length: 246, expected: [200, 246, 2, 2] },
		{ input: { wordstart: 200, wordend: 300 }, length: 200, expected: [100, 200, 1, 1] },
		{ input: { wordstart: 50, wordend: 10 }, length: 246, expected: [50, 150, 0, 2] },
		{ input: { wordstart: 50, wordend: 50 }, length: 246, expected: [50, 150, 0, 2] },
		{ input: { wordstart: 1.5, wordend: Number.NaN }, length: 246, expected: [0, 100, 0, 2] },
		{ input: { wordstart: 200, wordend: 300 }, length: 0, expected: [0, 0, 0, 0] },
		{ input: { wordstart: 0, wordend: 100, findhit: 100 }, length: 246, expected: [100, 200, 1, 2] },
		{ input: { wordstart: 0, wordend: 100, findhit: 99 }, length: 246, expected: [0, 100, 0, 2] },
		{ input: { wordstart: 0, wordend: 100, findhit: 246 }, length: 246, expected: [0, 100, 0, 2] },
	])('bounds $input within a field of $length tokens', ({ input, length, expected }) => {
		const range = getArticlePagination({ pageSize: 100, ...input }, length);
		expect([range.wordstart, range.wordend, range.page, range.maxPage]).toEqual(expected);
	});

	test.each([null, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('page size %s retrieves the whole field', pageSize => {
		expect(getArticlePagination({ pageSize, wordstart: 20, wordend: 30 }, 246)).toEqual({ pageSize: null, wordstart: 0, wordend: 246, page: 0, maxPage: 0 });
	});
});
