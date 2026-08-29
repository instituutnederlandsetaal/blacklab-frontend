// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createBlfRouter } from '@/navigation/router';

beforeEach(() => {
	vi.stubGlobal('CONTEXT_URL', '/');
	window.history.replaceState({}, '', '/');
});

describe('config routes', () => {
	function setup() {
		return createBlfRouter({ changePage: vi.fn() } as never);
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
});
