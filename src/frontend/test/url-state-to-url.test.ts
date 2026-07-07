import { describe, expect, test } from 'vitest';

import { stateToUrl } from '@/url/state-to-url';

describe('stateToUrl', () => {
	test('adds scoped form query parameters and emits searchfield without legacy field', () => {
		const result = stateToUrl({
			contextUrl: '/blacklab',
			indexId: 'test-corpus',
			params: {
				number: 20,
				patt: '[word="(?i)water"]',
				searchfield: 'contents',
			},
			scopedFormQuery: {
				'f.form': 'search.simple',
				'f.word': 'water',
			},
			state: {
				query: {} as any,
				global: {
					context: null,
					pageSize: 20,
					sampleMode: 'percentage',
					sampleSeed: null,
					sampleSize: null,
					useNewSearchForm: true,
				},
				interface: {
					form: 'search',
					patternMode: 'simple',
					exploreMode: 'ngram',
					viewedResults: 'hits',
					activeAnnotationTab: null,
					activeFilterTab: null,
				},
				views: {
					hits: {
						customState: null,
						groupBy: [],
						first: 0,
						number: 20,
						requestedRange: null,
						sort: null,
						viewGroup: null,
						groupDisplayMode: null,
					},
				},
			},
		});

		const url = new URL(result.url, 'https://example.test');
		expect(url.searchParams.get('searchfield')).toBe('contents');
		expect(url.searchParams.has('field')).toBe(false);
		expect(url.searchParams.get('f.form')).toBe('search.simple');
		expect(url.searchParams.get('f.word')).toBe('water');
	});
});
