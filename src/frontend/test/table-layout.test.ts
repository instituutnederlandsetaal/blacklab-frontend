// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { DisplaySettingsForRendering } from '@/pages/search/results/table/table-layout';
import { makeColumns, makeRows } from '@/pages/search/results/table/table-layout';
import type { BLDocGroupResults, BLDocResults, BLHitGroupResults, BLSearchSummaryV5 } from '@/types/blacklabtypes';

beforeAll(() => vi.stubGlobal('CONTEXT_URL', ''));
afterAll(() => vi.unstubAllGlobals());

function summary(group: string, pattern: boolean): BLSearchSummaryV5 {
	const stats = {
		status: 'finished' as const,
		hits: pattern ? 80 : undefined,
		documents: 50,
		timeMs: 1,
		stoppedBecauseTooMany: false,
	};
	return {
		params: { group, first: 0, number: 10, patt: pattern ? '[]' : undefined },
		pattern: pattern ? { bcql: '[]', fieldName: 'contents' } : undefined,
		results: {
			window: { firstResult: 0, requestedSize: 10, actualSize: 1, hasPrevious: false, hasNext: false },
			stats: {
				processed: stats,
				counted: stats,
				subcorpusSize: { documents: 100, tokens: 1000 },
				numberOfGroups: 1,
				largestGroupSize: pattern ? 20 : 10,
			},
			sample: { percentage: undefined, seed: undefined, sample: undefined },
		},
	};
}

function hitGroups(group: 'field:genre' | 'hit:lemma'): BLHitGroupResults {
	return {
		hitGroups: [
			{
				identity: 'fiction',
				identityDisplay: 'fiction',
				size: 20,
				numberOfDocs: 8,
				properties: [{ name: group, value: 'fiction' }],
				subcorpusSize: group === 'field:genre' ? { documents: 40, tokens: 400 } : undefined,
			},
		],
		summary: summary(group, true),
	};
}

function docGroups(): BLDocGroupResults {
	return {
		docGroups: [
			{
				identity: 'fiction',
				identityDisplay: 'fiction',
				size: 10,
				numberOfTokens: 250,
				properties: [{ name: 'field:genre', value: 'fiction' }],
				subcorpusSize: { documents: 20, tokens: 300 },
			},
		],
		summary: summary('field:genre', false),
	};
}

function renderingInfo(groupDisplayMode = 'table'): DisplaySettingsForRendering {
	return {
		indexId: 'test',
		mainAnnotation: { id: 'word' },
		otherAnnotations: [],
		detailedAnnotations: [],
		dependencyAnnotations: [],
		dependencyRelationClass: null,
		sortableAnnotations: [],
		annotationGroups: [],
		metadata: [],
		sourceField: { id: 'contents' },
		targetFields: [],
		specialFields: {},
		getSummary: () => '',
		dir: 'ltr',
		html: false,
		i18n: {
			$t: (key: string) => key,
			$tAnnotDisplayName: ({ id }: { id: string }) => id,
			$tAnnotGroupName: ({ id }: { id: string }) => id,
			$tMetaDisplayName: ({ id }: { id: string }) => id,
		} as unknown as DisplaySettingsForRendering['i18n'],
		groupDisplayMode: groupDisplayMode as DisplaySettingsForRendering['groupDisplayMode'],
		hasCustomHitInfoColumn: () => false,
		getCustomHitInfo: () => null,
		getMatchInfoHighlightStyle: () => undefined,
		requestedRange: null,
	} as unknown as DisplaySettingsForRendering;
}

function groupedColumns(results: BLHitGroupResults | BLDocGroupResults, mode: string) {
	const { groupColumns, groupModeOptions } = makeColumns(results, renderingInfo(mode));
	return {
		columns: groupColumns.map(column => (column.barField ? [column.barField, column.labelField] : column.labelField)),
		modes: groupModeOptions,
	};
}

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

	test('retains live hit-group values and maxima', () => {
		const result = makeRows(hitGroups('field:genre'), renderingInfo());
		expect(result.rows[0]).toEqual({
			type: 'group',
			id: 'fiction',
			size: 20,
			displayname: 'fiction',
			'r.d': 50,
			'r.h': 80,
			'gr.d': 8,
			'gr.t': undefined,
			'gr.h': 20,
			'gsc.d': 40,
			'gsc.t': 400,
			'sc.d': 100,
			'sc.t': 1000,
			'relative group size [gr.d/r.d]': 0.16,
			'relative group size [gr.h/r.h]': 0.25,
			'relative frequency (docs) [gr.d/gsc.d]': 0.2,
			'relative frequency (hits) [gr.h/gsc.t]': 0.05,
			'relative frequency (docs) [gr.d/sc.d]': 0.08,
			'relative frequency (tokens) [gr.t/sc.t]': undefined,
			'average document length [gr.t/gr.d]': undefined,
			muted: false,
		});
		expect(result.maxima).toEqual({
			'gr.h': 20,
			size: 20,
			'r.d': 50,
			'r.h': 80,
			'gr.d': 8,
			'gsc.d': 40,
			'gsc.t': 400,
			'sc.d': 100,
			'sc.t': 1000,
			'relative group size [gr.d/r.d]': 0.16,
			'relative group size [gr.h/r.h]': 0.25,
			'relative frequency (docs) [gr.d/gsc.d]': 0.2,
			'relative frequency (hits) [gr.h/gsc.t]': 0.05,
			'relative frequency (docs) [gr.d/sc.d]': 0.08,
		});
	});

	test('retains live document-group token values and maxima', () => {
		const result = makeRows(docGroups(), renderingInfo());
		expect(result.rows[0]).toEqual({
			type: 'group',
			id: 'fiction',
			size: 10,
			displayname: 'fiction',
			'r.d': 50,
			'r.h': undefined,
			'gr.d': 10,
			'gr.t': 250,
			'gr.h': undefined,
			'gsc.d': 20,
			'gsc.t': 300,
			'sc.d': 100,
			'sc.t': 1000,
			'relative group size [gr.d/r.d]': 0.2,
			'relative group size [gr.h/r.h]': undefined,
			'relative frequency (docs) [gr.d/gsc.d]': 0.5,
			'relative frequency (hits) [gr.h/gsc.t]': undefined,
			'relative frequency (docs) [gr.d/sc.d]': 0.1,
			'relative frequency (tokens) [gr.t/sc.t]': 0.25,
			'average document length [gr.t/gr.d]': 25,
			muted: false,
		});
		expect(result.maxima).toEqual({
			'gr.d': 10,
			size: 10,
			'r.d': 50,
			'gr.t': 250,
			'gsc.d': 20,
			'gsc.t': 300,
			'sc.d': 100,
			'sc.t': 1000,
			'relative group size [gr.d/r.d]': 0.2,
			'relative frequency (docs) [gr.d/gsc.d]': 0.5,
			'relative frequency (docs) [gr.d/sc.d]': 0.1,
			'relative frequency (tokens) [gr.t/sc.t]': 0.25,
			'average document length [gr.t/gr.d]': 25,
		});
	});
});

describe('grouped columns', () => {
	test.each([
		[
			'hit metadata table',
			hitGroups('field:genre'),
			'table',
			['displayname', 'gr.d', 'gr.h', 'gsc.d', 'gsc.t', 'relative frequency (docs) [gr.d/gsc.d]', 'relative frequency (hits) [gr.h/gsc.t]'],
			['table', 'docs', 'hits', 'relative docs', 'relative hits'],
		],
		['hit annotation table', hitGroups('hit:lemma'), 'table', ['displayname', 'gr.h', 'relative frequency (hits) [gr.h/gsc.t]'], ['table', 'hits']],
		['hit annotation bars', hitGroups('hit:lemma'), 'hits', ['displayname', ['relative frequency (hits) [gr.h/gsc.t]', 'gr.h'], 'relative frequency (hits) [gr.h/gsc.t]'], ['table', 'hits']],
		[
			'document metadata table',
			docGroups(),
			'table',
			['displayname', 'gr.d', 'gr.t', 'relative frequency (docs) [gr.d/sc.d]', 'relative frequency (tokens) [gr.t/sc.t]', 'average document length [gr.t/gr.d]'],
			['table', 'docs', 'tokens'],
		],
		[
			'document metadata token bars',
			docGroups(),
			'tokens',
			['displayname', ['relative frequency (tokens) [gr.t/sc.t]', 'gr.t'], 'relative frequency (tokens) [gr.t/sc.t]'],
			['table', 'docs', 'tokens'],
		],
	] as const)('keeps exact %s columns and modes', (_name, results, mode, columns, modes) => {
		expect(groupedColumns(results, mode)).toEqual({ columns, modes });
	});
});
