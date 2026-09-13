import { afterEach, describe, expect, test } from 'vitest';

import { actions, getState } from '@/features/search/model/results/global-results-state';
import { initialViewState } from '@/features/search/model/results/view-state';
import { submittedSearchFromResult } from '@/features/search/model/submitted-search';
import { createSearchPageQuery, readSearchQuery, readSearchResultSettings } from '@/url/search-query';

const defaults = { ...getState(), context: null, sampleSeed: null, sampleSize: null };

afterEach(() => {
	actions.reset();
});

describe('search URL serialization', () => {
	test('a new-form submission persists its identity in scoped params and replaces old params', () => {
		const submitted = submittedSearchFromResult({ formId: 'explore.corpora', encoded: { 'f.form': 'explore.corpora' }, issues: [], params: { filter: 'author:Austen' }, summaries: [] });
		const result = createSearchPageQuery({ submitted, global: defaults, view: initialViewState });
		expect(result).toMatchObject({ 'f.form': 'explore.corpora', filter: 'author:Austen' });
		expect(result).not.toHaveProperty('interface');
		expect(result).not.toHaveProperty('patt');
	});

	test('preserves repeated scoped form values through submission and result changes', () => {
		const encoded = { 'f.form': 'search.extended', 'f.tabs': ['search:extended', 'filters:author'], 'f.author': ['Austen', 'Brontë'] };
		const submitted = submittedSearchFromResult({ formId: 'search.extended', encoded, issues: [], params: { patt: '[]' }, summaries: [] });
		expect(createSearchPageQuery({ submitted, global: defaults, view: initialViewState })).toMatchObject(encoded);
	});

	test('clears removed result settings and retains collocation context independently of snippet context', () => {
		const result = createSearchPageQuery({
			submitted: readSearchQuery({ colltype: 'proximity', context: '3:4', group: 'hit:word', viewgroup: 'word:water', sort: '-size', sample: '20', sampleseed: '123' }).submitted,
			global: { ...defaults, context: 9 },
			view: initialViewState,
		});
		expect(result).toMatchObject({ colltype: 'proximity', context: '3:4', scorertype: 'coll-dice' });
		for (const key of ['group', 'viewgroup', 'sort', 'sample', 'sampleseed']) expect(result).not.toHaveProperty(key);
	});
});

describe('search result URL decoding', () => {
	test('decodes selection and display controls independently of editable forms', () => {
		const query = {
			first: '45',
			number: '30',
			group: 'hit:word',
			sort: '-size',
			viewgroup: 'word:water',
			groupDisplayMode: 'relative hits',
			resultViewCustomState: '{"column":"lemma"}',
			samplenum: '8',
			sampleseed: '123',
			context: '7',
		};
		const { view, global } = readSearchResultSettings(query, 50);
		expect(view).toMatchObject({ first: 45, number: 30, groupBy: ['hit:word'], sort: '-size', viewGroup: 'word:water', groupDisplayMode: 'relative hits', customState: { column: 'lemma' } });
		expect(global).toEqual({ sampleMode: 'count', sampleSize: 8, sampleSeed: 123, context: 7 });
	});

	test('uses the preferred count and ignores malformed display state without losing the search', () => {
		const query = { patt: '[word="water"]', number: '-1', groupDisplayMode: 'unknown', resultViewCustomState: '{broken' };
		expect(readSearchResultSettings(query, 50).view).toMatchObject({ first: 0, number: 50, groupDisplayMode: null, customState: null });
		expect(readSearchQuery(query).submitted.params.patt).toBe('[word="water"]');
	});
});
