import { describe, expect, test, vi } from 'vitest';

import type { BlackLabApi } from '@/shared/api/lib/api-types';
import { parseBcql } from '@/shared/blacklab-helpers/cql/bcql-json-interpreter';

describe('parseBcql', () => {
	test('interprets BL5 compare nodes with a symbol annotation clause', async () => {
		const response = {
			params: {
				patt: '[word=".*"]',
				pattlang: 'default',
			},
			parsed: {
				bcql: '[word = ".*"]',
				json: {
					bcqlFragment: '[word = ".*"]',
					type: 'compare',
					clauses: [
						{
							bcqlFragment: 'word',
							type: 'symbol',
							value: 'word',
						},
						{
							bcqlFragment: '".*"',
							type: 'string',
							value: '.*',
						},
					],
					operation: '=',
				},
			},
		};
		const blacklab = {
			getParsePattern: vi.fn().mockResolvedValue(response),
		} as unknown as BlackLabApi;

		await expect(parseBcql(blacklab, 'test-index', '[word=".*"]', 'word')).resolves.toEqual([
			{
				query: '[word = ".*"]',
				tokens: [
					{
						expression: {
							type: 'condition',
							name: 'word',
							operator: '=',
							value: '.*',
						},
						optional: false,
					},
				],
			},
		]);
	});
});
