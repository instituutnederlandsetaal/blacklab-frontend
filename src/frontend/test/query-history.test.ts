// @vitest-environment jsdom

import { File } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { CorpusContext } from '@/app/state/useCorpusContext';
import { actions, get, getState, init, setUrlDecoder } from '@/features/history/model/query-history-state';
import { queryHistoryDetails } from '@/url/query-history';

beforeEach(() => {
	setUrlDecoder(queryHistoryDetails);
	window.localStorage.clear();
});

afterEach(() => {
	actions.clear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
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

	test('does not record URLs without search results', () => {
		for (const url of ['/test/search', '/test/docs/document']) actions.addEntry({ url });
		expect(getState()).toEqual([]);
	});

	test.each(['', '/blacklab-frontend'])('includes the origin in saved result links under "%s" while preserving the trailing slash and hash', base => {
		const url = `${base}/test-corpus/search/hits/?patt=[]#results`;
		actions.addEntry({ url });
		expect(getState()[0].url).toBe(window.location.origin + url);
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

	test.each([11, 12])('restores searches saved by history version %s with absolute URLs', version => {
		const url = '/test-corpus/search/hits?patt=[]';
		window.localStorage.setItem(
			'cf/history/test-corpus',
			JSON.stringify({
				version,
				indexLastModified: 'now',
				history: [
					{
						url,
						timestamp: 123,
						hash: 5,
						displayValues: { pattern: 'Any word', filters: '-' },
						patterns: { large: 'snapshot' },
						newForm: { formId: 'search.form', params: { patt: '[word="water"]' } },
					},
					{ url, timestamp: 100, hash: 6, patterns: { older: 'snapshot of the same query' } },
				],
			}),
		);
		init({ index: { id: 'test-corpus', timeModified: 'now' } } as CorpusContext);
		expect(getState()).toHaveLength(1);
		expect(getState()[0]).toMatchObject({ url: window.location.origin + url, displayValues: { pattern: 'Any word', filters: '-' } });
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
		const imported = await get.fromFile(new File([contents], 'unicode-query.txt'));
		const importedUrl = new URL(imported.url);
		expect(importedUrl.origin).toBe(window.location.origin);
		expect(decodeURIComponent(importedUrl.pathname)).toBe('/日本語/search/hits');
		expect(importedUrl.searchParams.get('patt')).toBe('[word="水😀"]');
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
