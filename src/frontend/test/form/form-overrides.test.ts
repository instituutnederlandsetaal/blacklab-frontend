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
});
