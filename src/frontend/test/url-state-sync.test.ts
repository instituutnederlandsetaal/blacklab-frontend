// @vitest-environment jsdom

import { describe, expect, test } from 'vitest';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

import { getCanonicalFormParametersFromRoute } from '@/url/url-state-sync';

function route(query: RouteLocationNormalizedLoaded['query']): RouteLocationNormalizedLoaded {
	return {
		query,
	} as RouteLocationNormalizedLoaded;
}

describe('url-state-sync helpers', () => {
	test('ignores canonical searchfield while restoring new-form state for non-parallel corpora', () => {
		expect(
			getCanonicalFormParametersFromRoute(route({ patt: '[word="water"]', searchfield: 'contents__nl' }), {
				isParallelCorpus: false,
			}),
		).toEqual({
			patt: '[word="water"]',
			filter: null,
			searchfield: null,
		});
	});

	test('keeps canonical searchfield while restoring new-form state for parallel corpora', () => {
		expect(
			getCanonicalFormParametersFromRoute(route({ patt: '[word="water"]', searchfield: 'contents__nl' }), {
				isParallelCorpus: true,
			}),
		).toEqual({
			patt: '[word="water"]',
			filter: null,
			searchfield: 'contents__nl',
		});
	});
});
