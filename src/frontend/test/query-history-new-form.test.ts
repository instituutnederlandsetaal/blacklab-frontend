// @vitest-environment jsdom

import { File } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import type { CompiledFormResult } from '@/features/form';
import { actions, get, getState, init, setUrlDecoder } from '@/features/history/model/query-history-state';
import { LegacyFormRestorer } from '@/features/search/model/form/restore-legacy-form';
import { summarizeCompiledForm } from '@/features/search/model/search-summary';
import { queryHistoryDetails, queryHistoryFromUrl } from '@/url/query-history';

beforeEach(() => setUrlDecoder(queryHistoryDetails));

afterEach(() => {
	actions.clear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const mixedSummaries: CompiledFormResult['summaries'] = [
	{ label: 'Frontend only', summaryType: [], value: 'frontend' },
	{ label: 'Pattern only', summaryType: ['patt'], value: 'pattern' },
	{ label: 'Filter only', summaryType: ['filter'], value: 'filter' },
	{ label: 'Multi-type', summaryType: ['patt', 'filter'], value: 'shared' },
];

function mixedSummaryForm(): CompiledFormResult {
	return {
		encoded: { 'f.form': 'search.form' },
		formId: 'search.form',
		params: { filter: 'author:Austen', patt: '[word="water"]' },
		issues: [],
		summaries: mixedSummaries,
	};
}

describe('new-form query summary selectors', () => {
	test('selects summaries by their normalized output types', () => {
		const summary = summarizeCompiledForm(mixedSummaryForm());

		expect(summary.pattern).toBe('Pattern only: pattern, Multi-type: shared');
		expect(summary.filter).toBe('Filter only: filter, Multi-type: shared');
	});

	test('combines the researcher-facing collocation settings', () => {
		const form = mixedSummaryForm();
		form.params = {
			annotation: 'word',
			colltype: 'proximity',
			context: 5,
			patt: '[word="ship"]',
			scorertype: 'coll-dice',
			sensitive: false,
		};
		form.summaries = [
			{ label: 'Word', summaryType: ['patt'], value: 'ship' },
			{ label: 'Collocate', summaryType: ['collpatt'], value: 'Any collocate' },
			{ label: 'Window', summaryType: ['context'], value: 'L5/R5' },
			{ label: 'Documents', summaryType: ['filter'], value: 'year:1800-1900' },
		];
		const summary = summarizeCompiledForm(form);

		expect(summary.pattern).toBe('Word: ship · Collocate: Any collocate · Window: L5/R5');
	});
});

describe('URL query history', () => {
	test('importing a link saves its decoded summary without loading the search', async () => {
		const currentUrl = window.location.href;
		const url = 'https://saved.example/test-corpus/search/hits?patt=%5Bword%3D%22water%22%5D';
		await actions.importUrl(url, async url => ({ url, displayValues: { pattern: 'Word: water', filters: '-' } }));
		expect(window.location.href).toBe(currentUrl);
		expect(getState()).toHaveLength(1);
		expect(getState()[0]).toMatchObject({ url, displayValues: { pattern: 'Word: water', filters: '-' } });
	});

	test('uses the legacy pattern alias in imported search summaries', async () => {
		vi.stubGlobal('CONTEXT_URL', '/');
		vi.spyOn(LegacyFormRestorer.prototype, 'get').mockResolvedValue({
			interface: { form: 'search' },
			filters: {},
		} as never);
		const url = '/test/search/hits?query=' + encodeURIComponent('[word="water"]');
		await expect(queryHistoryFromUrl(url, { corpus: { allAnnotationsMap: {} } } as never)).resolves.toEqual({ url, displayValues: { pattern: '[word="water"]', filters: '' } });
	});

	test('does not record URLs without search results', () => {
		for (const url of ['/test/search', '/test/docs/document']) actions.addEntry({ url });
		expect(getState()).toEqual([]);
	});

	test('keeps a saved result link loadable with a trailing slash', () => {
		const url = '/test-corpus/search/hits/?patt=[]';
		actions.addEntry({ url });
		expect(getState()[0].url).toBe(url);
		expect(get.details(getState()[0])).toEqual({ viewedResults: 'hits', collocation: false, groupBy: [] });
	});

	test.each([
		['pattern', 'patt=[word="water"]', 'patt=[word="ship"]'],
		['gap values', 'patt=[word="@@"]&pattgapdata=water', 'patt=[word="@@"]&pattgapdata=ship'],
		['filter', 'filter=author:Austen', 'filter=author:Bronte'],
		['search field', 'searchfield=contents__nl', 'searchfield=contents__en'],
		['collocation window', 'patt=[]&colltype=proximity&context=3', 'patt=[]&colltype=proximity&context=5'],
	])('keeps searches with different %s settings', (_label, first, second) => {
		for (const query of [first, second]) actions.addEntry({ url: '/test-corpus/search/hits?' + query });
		expect(getState()).toHaveLength(2);
	});

	test('deduplicates queries when only result settings differ', () => {
		for (const query of ['first=0&number=20&sort=hit:word&scorertype=coll-dice', 'first=40&number=50&sort=-hit:word&scorertype=coll-salience'])
			actions.addEntry({ url: '/test-corpus/search/hits?patt=[]&' + query });
		expect(getState()).toHaveLength(1);
	});

	test('restores searches saved by the previous history version', () => {
		const storage = new Map<string, string>();
		vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
		const url = '/test-corpus/search/hits?patt=[]';
		window.localStorage.setItem(
			'cf/history/test-corpus',
			JSON.stringify({
				version: 11,
				indexLastModified: 'now',
				history: [
					{ url, timestamp: 123, hash: 5, displayValues: { pattern: 'Any word', filters: '-' }, patterns: { large: 'snapshot' }, newForm: mixedSummaryForm() },
					{ url, timestamp: 100, hash: 6, patterns: { older: 'snapshot of the same query' } },
				],
			}),
		);
		init({ index: { id: 'test-corpus', timeModified: 'now' } } as CorpusContext);
		expect(getState()).toHaveLength(1);
		expect(getState()[0]).toMatchObject({ url, displayValues: { pattern: 'Any word', filters: '-' } });
	});

	test('exported searches retain Unicode queries and readable summaries when imported', async () => {
		const url = '/日本語/search/hits?patt=[word="水😀"]';
		actions.addEntry({ url, displayValues: { pattern: '日本語\n😀', filters: '著者: 夏目漱石' } });
		const { file } = get.asFile(getState()[0]);
		const contents = await new Promise<string>(resolve => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.readAsText(file);
		});
		expect(contents).toContain('# Pattern: 日本語');
		expect(contents).toContain('# Filters: 著者: 夏目漱石');
		await expect(get.fromFile(new File([contents], 'unicode-query.txt'))).resolves.toEqual({ url });
	});

	test('imports a search file exported by the previous version', async () => {
		const url = '/test-corpus/search/hits?patt=[]';
		const file = new File(['# Query\n#####\n' + btoa(JSON.stringify({ version: 11, url, patterns: { old: 'snapshot' } })) + '\n#####'], 'query.txt');
		await expect(get.fromFile(file)).resolves.toEqual({ url });
	});

	test('rejects files without a replayable URL', async () => {
		await expect(get.fromFile(new File([btoa(JSON.stringify({ version: 12 }))], 'query.txt'))).rejects.toThrow('Could not read query file');
	});
});
