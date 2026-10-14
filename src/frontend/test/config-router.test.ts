// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createBlfRouter } from '@/navigation/router';

// Route matching and bootstrap transitions do not mount page components.
vi.mock('@/pages/corpus/CorpusPage.vue', () => ({ default: {} }));
vi.mock('@/pages/config/CorpusConfig.vue', () => ({ default: {} }));
vi.mock('@/pages/config/POS.vue', () => ({ default: {} }));
vi.mock('@/pages/config/Interface.vue', () => ({ default: {} }));
vi.mock('@/pages/search/SearchPage.vue', () => ({ default: {} }));
vi.mock('@/pages/article/ArticlePage.vue', () => ({ default: {} }));
vi.mock('@/pages/about/AboutPage.vue', () => ({ default: {} }));

const cleanup: (() => void)[] = [];

beforeEach(() => {
	vi.stubGlobal('CONTEXT_URL', '/');
	window.history.replaceState({}, '', '/');
});

afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	vi.unstubAllGlobals();
});

describe('config routes', () => {
	function setup(changePage = vi.fn()) {
		const routing = createBlfRouter({ changePage } as never);
		cleanup.push(() => routing.router.options.history.destroy());
		return { ...routing, changePage };
	}

	test('renders the corpus picker as the global config default child', () => {
		const { router } = setup();
		const route = router.resolve('/configwizard');

		expect(route).toMatchObject({ name: 'global-configwizard', path: '/configwizard' });
		expect(route.matched).toHaveLength(2);
	});

	test('keeps direct child links and redirects corpus config to the tagset builder', async () => {
		const { corpusId, router } = setup();

		expect(router.resolve({ name: 'tagset builder', params: { corpus: 'multi' } }).path).toBe('/multi/configwizard/pos');
		expect(router.resolve({ name: 'interface', params: { corpus: 'multi' } }).path).toBe('/multi/configwizard/interface');

		await router.push('/multi/configwizard');
		await router.isReady();
		expect(router.currentRoute.value).toMatchObject({ name: 'tagset builder', path: '/multi/configwizard/pos' });
		expect(corpusId.value).toBe('multi');

		await router.push('/multi/configwizard/interface');
		expect(router.currentRoute.value).toMatchObject({ name: 'interface', path: '/multi/configwizard/interface' });
	});

	test('keeps bootstrap settlement only for the same route and corpus instance', async () => {
		const { changePage, router } = setup();

		await router.push('/alpha/search?q=one');
		await router.push('/alpha/search?q=two');
		await router.push('/beta/search');
		await router.push('/alpha/docs/one');
		await router.push('/alpha/docs/two');
		await router.push('/about');
		await router.push('/alpha/about');

		expect(changePage.mock.calls.map(([page, samePageInstance]) => [page.name, samePageInstance])).toEqual([
			['search', false],
			['search', true],
			['search', false],
			['article', false],
			['article', true],
			['about', false],
			['about', false],
		]);
	});
});
