import { describe, expect, test, vi } from 'vitest';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import { getArticleUrlStateFromRoute, getNumberFromRouteQuery, getStringFromRouteQuery, updateRouteQuery } from '@/url/route-query';

function route(partial: Partial<RouteLocationNormalizedLoaded>): RouteLocationNormalizedLoaded {
	return {
		name: 'article',
		params: {},
		query: {},
		...partial,
	} as RouteLocationNormalizedLoaded;
}

describe('route-query helpers', () => {
	test('reads article state from route params and query fallbacks', () => {
		const state = getArticleUrlStateFromRoute(
			route({
				params: { docId: 'doc-1' },
				query: {
					field: 'contents',
					wordstart: '10',
					wordend: '20',
					findhit: '12',
					query: '"needle"',
					pattgapdata: 'gap',
				},
			}),
		);

		expect(state).toEqual({
			docId: 'doc-1',
			viewField: 'contents',
			wordstart: 10,
			wordend: 20,
			findhit: 12,
			pattern: '"needle"',
			pattgapdata: 'gap',
			searchfield: 'contents',
		});
	});

	test('uses the first non-empty query value', () => {
		const currentRoute = route({
			query: {
				first: ['10', '20'],
				empty: '',
				fallback: 'value',
				nan: 'abc',
			},
		});

		expect(getStringFromRouteQuery(currentRoute, 'missing', 'fallback')).toBe('value');
		expect(getNumberFromRouteQuery(currentRoute, 'first')).toBe(10);
		expect(getNumberFromRouteQuery(currentRoute, 'nan')).toBeNull();
		expect(getStringFromRouteQuery(currentRoute, 'empty')).toBeNull();
	});

	test('patches the current route query through the router', () => {
		const push = vi.fn();
		const currentRoute = route({
			name: 'article',
			params: { corpus: 'test', docId: 'doc-1' },
			query: {
				field: 'contents',
				wordstart: '10',
				findhit: '12',
			},
		});

		void updateRouteQuery({ push } as unknown as Router, currentRoute, {
			wordstart: 20,
			wordend: 30,
			findhit: undefined,
		});

		expect(push).toHaveBeenCalledWith({
			name: 'article',
			params: { corpus: 'test', docId: 'doc-1' },
			query: {
				field: 'contents',
				wordstart: '20',
				wordend: '30',
			},
		});
	});
});
