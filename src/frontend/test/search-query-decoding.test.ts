import { describe, expect, test } from 'vitest';

import { readSearchQuery, readSubmittedSearch } from '@/url/search-query';

describe('search query decoding', () => {
	test('extracts the curated canonical request parameters and normalizes aliases', () => {
		const overrides = readSubmittedSearch({
			query: ['', '[word="water"]'],
			filter: ['', 'author:Austen'],
			searchField: 'contents__nl',
			withspans: 'true',
			sensitive: 'false',
			scorertype: 'coll-salience',
			group: 'field:author',
			sort: 'field:title',
			context: '9',
		}).params;

		expect(overrides).toEqual({
			patt: '[word="water"]',
			filter: 'author:Austen',
			searchfield: 'contents__nl',
			withspans: true,
			sensitive: false,
		});
	});

	test('leaves omitted request defaults out of decoded inputs', () => {
		const { submitted, view } = readSearchQuery({ patt: '[]', first: '7', number: '33' }, 20);
		expect(submitted.params.searchfield).toBeUndefined();
		expect(view).toMatchObject({ first: 7, number: 33, groupBy: [], sort: null });
	});

	test('accepts a fractional sampling percentage while ignoring fractional integer parameters', () => {
		const { view, global } = readSearchQuery({ first: '1.5', number: '2.5', context: '3.5', samplenum: '4.5', sampleseed: '5.5', sample: '12.5' }, 20);
		expect(view).toMatchObject({ first: 0, number: 20 });
		expect(global).toEqual({ context: null, sampleMode: 'percentage', sampleSize: 12.5, sampleSeed: null });
	});

	test('falls back to the first page when the selection cannot expand to whole pages safely', () => {
		const { view } = readSearchQuery({ first: String(Number.MAX_SAFE_INTEGER - 2), number: '1' }, 20);
		expect(view).toMatchObject({ first: 0, number: 20 });
	});

	test('retains searchfield independently of form or corpus configuration', () => {
		expect(readSubmittedSearch({ searchfield: 'contents__nl' }).params).toEqual({ searchfield: 'contents__nl' });
	});

	test('ignores empty values for every accepted URL override', () => {
		const keys = ['patt', 'query', 'collpatt', 'filter', 'searchfield', 'searchField', 'field', 'withspans', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive', 'scorertype'];
		expect(readSubmittedSearch(Object.fromEntries(keys.map(key => [key, '']))).params).toEqual({});
		expect(readSubmittedSearch({ colltype: ['', 'proximity'], context: '' }).params).toEqual({ colltype: 'proximity' });
	});

	test('assigns raw context to the form only for a valid collocation discriminator', () => {
		expect(readSubmittedSearch({ colltype: 'proximity', context: '5' }).params).toEqual({ colltype: 'proximity', context: 5 });
		expect(readSubmittedSearch({ colltype: 'proximity', context: '03:04' }).params).toEqual({ colltype: 'proximity', context: '3:4' });
		expect(readSubmittedSearch({ colltype: 'proximity', context: '0' }).params).toEqual({ colltype: 'proximity', context: 0 });
		expect(readSubmittedSearch({ colltype: 'proximity', context: '-1' }).params).toEqual({ colltype: 'proximity', context: null });
		expect(readSubmittedSearch({ colltype: 'invalid', context: '3:4' }).params).toEqual({});
		expect(readSubmittedSearch({ context: '5' }).params).toEqual({});
	});

	test('keeps collocation query parameters separate from result controls', () => {
		const { submitted, view } = readSearchQuery(
			{
				colltype: 'proximity',
				collpatt: '[lemma="ship"]',
				annotation: 'lemma',
				within: 's',
				reltype: 'aligns',
				context: '9',
				sensitive: 'false',
				scorertype: 'coll-salience',
				group: 'field:author',
				sort: 'field:title',
			},
			20,
		);

		expect(submitted.params).toEqual({
			colltype: 'proximity',
			collpatt: '[lemma="ship"]',
			annotation: 'lemma',
			within: 's',
			reltype: 'aligns',
			context: 9,
			sensitive: false,
		});
		expect(view).toMatchObject({ collocationScorer: 'coll-salience', groupBy: [], sort: 'field:title' });
	});
});
