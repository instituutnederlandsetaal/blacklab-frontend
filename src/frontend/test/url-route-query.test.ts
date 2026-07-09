import { describe, expect, test, vi } from 'vitest';
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

import { getNumberFromRouteQuery, getStringFromRouteQuery, updateRouteQuery } from '@/url/route-query';

function route(partial: Partial<RouteLocationNormalizedLoaded>): RouteLocationNormalizedLoaded {
	return {
		name: 'article',
		params: {},
		query: {},
		...partial,
	} as RouteLocationNormalizedLoaded;
}

describe('route-query helpers', () => {
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
