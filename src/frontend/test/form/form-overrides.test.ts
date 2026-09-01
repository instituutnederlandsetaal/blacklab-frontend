import { describe, expect, test } from 'vitest';

import { extractSearchFormOverrides } from '@/features/search/model/new-form/form-overrides';

describe('search form override integration', () => {
	test('extracts the curated canonical request parameters and normalizes aliases', () => {
		const overrides = extractSearchFormOverrides(
			{
				query: ['', '[word="water"]'],
				filter: ['', 'author:Austen'],
				searchField: 'contents__nl',
				withspans: 'true',
				sensitive: 'false',
				group: 'field:author',
				sort: 'field:title',
				context: '9',
			},
			true,
		);

		expect(overrides).toEqual({
			patt: '[word="water"]',
			filter: 'author:Austen',
			searchfield: 'contents__nl',
			withspans: true,
			sensitive: false,
		});
	});

	test('omits searchfield for non-parallel corpora', () => {
		expect(extractSearchFormOverrides({ searchfield: 'contents__nl' }, false)).toEqual({});
	});

	test('ignores empty values for every accepted URL override', () => {
		const keys = ['patt', 'query', 'collpatt', 'filter', 'searchfield', 'searchField', 'field', 'withspans', 'colltype', 'context', 'within', 'reltype', 'annotation', 'sensitive', 'scorertype'];
		expect(extractSearchFormOverrides(Object.fromEntries(keys.map(key => [key, ''])), true)).toEqual({});
		expect(extractSearchFormOverrides({ colltype: ['', 'proximity'], context: '' }, false)).toEqual({ colltype: 'proximity' });
	});

	test('assigns raw context to the form only for a valid collocation discriminator', () => {
		expect(extractSearchFormOverrides({ colltype: 'proximity', context: '5' }, false)).toEqual({ colltype: 'proximity', context: 5 });
		expect(extractSearchFormOverrides({ colltype: 'proximity', context: '03:04' }, false)).toEqual({ colltype: 'proximity', context: '3:4' });
		expect(extractSearchFormOverrides({ colltype: 'proximity', context: '0' }, false)).toEqual({ colltype: 'proximity', context: 0 });
		expect(extractSearchFormOverrides({ colltype: 'proximity', context: '-1' }, false)).toEqual({ colltype: 'proximity', context: null });
		expect(extractSearchFormOverrides({ colltype: 'invalid', context: '3:4' }, false)).toEqual({});
		expect(extractSearchFormOverrides({ context: '5' }, false)).toEqual({});
	});
});
