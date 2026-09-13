import { describe, expect, test } from 'vitest';

import { readSearchQuery } from '@/url/search-query';

describe('search form override integration', () => {
	test('extracts the curated canonical request parameters and normalizes aliases', () => {
		const overrides = readSearchQuery({
			query: ['', '[word="water"]'],
			filter: ['', 'author:Austen'],
			searchField: 'contents__nl',
			withspans: 'true',
			sensitive: 'false',
			scorertype: 'coll-salience',
			group: 'field:author',
			sort: 'field:title',
			context: '9',
		}).submitted.params;

		expect(overrides).toEqual({
			patt: '[word="water"]',
			filter: 'author:Austen',
			searchfield: 'contents__nl',
			withspans: true,
			sensitive: false,
		});
	});

	test('leaves omitted request defaults out of decoded inputs', () => {
		const { submitted, results } = readSearchQuery({ patt: '[]', first: '7', number: '33' });
		expect(submitted.params.searchfield).toBeUndefined();
		expect(results).toMatchObject({ first: 7, number: 33, group: undefined, sort: undefined, scorertype: undefined });
	});

	test('retains searchfield independently of form or corpus configuration', () => {
		expect(readSearchQuery({ searchfield: 'contents__nl' }).submitted.params).toEqual({ searchfield: 'contents__nl' });
	});

	test('ignores empty values for every accepted URL override', () => {
		const keys = ['patt', 'query', 'collpatt', 'filter', 'searchfield', 'searchField', 'field', 'withspans', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive', 'scorertype'];
		expect(readSearchQuery(Object.fromEntries(keys.map(key => [key, '']))).submitted.params).toEqual({});
		expect(readSearchQuery({ colltype: ['', 'proximity'], context: '' }).submitted.params).toEqual({ colltype: 'proximity' });
	});

	test('assigns raw context to the form only for a valid collocation discriminator', () => {
		expect(readSearchQuery({ colltype: 'proximity', context: '5' }).submitted.params).toEqual({ colltype: 'proximity', context: 5 });
		expect(readSearchQuery({ colltype: 'proximity', context: '03:04' }).submitted.params).toEqual({ colltype: 'proximity', context: '3:4' });
		expect(readSearchQuery({ colltype: 'proximity', context: '0' }).submitted.params).toEqual({ colltype: 'proximity', context: 0 });
		expect(readSearchQuery({ colltype: 'proximity', context: '-1' }).submitted.params).toEqual({ colltype: 'proximity', context: null });
		expect(readSearchQuery({ colltype: 'invalid', context: '3:4' }).submitted.params).toEqual({});
		expect(readSearchQuery({ context: '5' }).submitted.params).toEqual({});
	});
});
