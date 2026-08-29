import { beforeEach, describe, expect, test, vi } from 'vitest';
import type * as VueRouter from 'vue-router';

import { useArticleRoute } from '@/navigation/router';

const mock = vi.hoisted(() => ({
	push: vi.fn(),
	route: undefined as unknown as VueRouter.RouteLocationNormalizedLoaded,
}));

vi.mock('vue-router', async importOriginal => ({
	...(await importOriginal<typeof VueRouter>()),
	useRoute: () => mock.route,
	useRouter: () => ({ push: mock.push }),
}));

function route(partial: Partial<VueRouter.RouteLocationNormalizedLoaded>): VueRouter.RouteLocationNormalizedLoaded {
	return {
		name: 'article',
		params: {},
		query: {},
		...partial,
	} as VueRouter.RouteLocationNormalizedLoaded;
}

const annotatedFields = { contents: {}, translation: {} };

beforeEach(() => {
	mock.push.mockReset();
	mock.route = route({});
});

describe('useArticleRoute', () => {
	test('preserves route parsing and alias precedence', () => {
		mock.route = route({
			params: { docId: ['doc-1', 'doc-2'] },
			query: {
				field: ['translation', 'contents'],
				searchfield: 'missing',
				searchField: 'translation',
				wordstart: '12px',
				wordend: '9'.repeat(400),
				findhit: ['7', '8'],
				patt: ['', 'ignored'],
				query: 'legacy-pattern',
				pattgapdata: ['gap', 'ignored'],
			},
		});

		expect(useArticleRoute(annotatedFields, 'contents').articleRoute.value).toEqual({
			docId: 'doc-1',
			viewField: 'translation',
			searchfield: 'contents',
			wordstart: 12,
			wordend: null,
			findhit: 7,
			patt: 'legacy-pattern',
			pattgapdata: 'gap',
		});
	});

	test.each([
		['searchfield', { searchfield: 'translation' }],
		['searchField', { searchField: 'translation' }],
		['field', { field: 'translation' }],
	] as const)('accepts the %s search-field alias', (_name, query) => {
		mock.route = route({ query });
		expect(useArticleRoute(annotatedFields, 'contents').articleRoute.value.searchfield).toBe('translation');
	});

	test('prefers the canonical pattern alias', () => {
		mock.route = route({ query: { patt: 'canonical', query: 'legacy' } });
		expect(useArticleRoute(annotatedFields, 'contents').articleRoute.value.patt).toBe('canonical');
	});

	test('patches through router.push while retaining unrelated query state', () => {
		const pushed = Promise.resolve();
		mock.push.mockReturnValue(pushed);
		mock.route = route({
			name: 'article',
			params: { corpus: 'test', docId: 'doc-1' },
			query: { field: 'contents', findhit: '12', patt: 'query', unrelated: 'keep', wordstart: '10' },
		});
		const { updateArticleQuery } = useArticleRoute(annotatedFields, 'contents');

		expect(updateArticleQuery({ wordstart: 20, wordend: 30, findhit: undefined, patt: null, enabled: false })).toBe(pushed);
		expect(mock.push).toHaveBeenCalledWith({
			name: 'article',
			params: { corpus: 'test', docId: 'doc-1' },
			query: { field: 'contents', unrelated: 'keep', wordstart: '20', wordend: '30', enabled: 'false' },
		});
	});
});
