// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { DisplaySettingsForRendering } from '@/pages/search/results/table/table-layout';
import { makeRows } from '@/pages/search/results/table/table-layout';
import type { BLDocResults } from '@/types/blacklabtypes';

beforeAll(() => vi.stubGlobal('CONTEXT_URL', ''));
afterAll(() => vi.unstubAllGlobals());

describe('makeRows', () => {
	test('mutes rows outside a requested range without normalizing response parameters in place', () => {
		const params = { first: '5', number: '3' };
		const results = {
			docs: Array.from({ length: 3 }, (_, i) => ({
				docPid: `doc-${i}`,
				docInfo: { metadata: {}, tokenCounts: [], mayView: true },
			})),
			summary: { params },
		} as unknown as BLDocResults;
		const info = {
			indexId: 'test',
			sourceField: { id: 'contents' },
			specialFields: {},
			getSummary: () => '',
			requestedRange: { first: 6, number: 1 },
		} as unknown as DisplaySettingsForRendering;

		expect(makeRows(results, info).rows.map(row => row.muted)).toEqual([true, false, true]);
		expect(results.summary.params).toBe(params);
		expect(params).toEqual({ first: '5', number: '3' });
	});
});
