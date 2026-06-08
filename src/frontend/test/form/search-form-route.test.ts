// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';
import { nextTick, watch } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { formRouteFingerprint, isFormOwnedQueryParameter, pickFormOwnedQueryParameters, readCanonicalFormQuery, replaceFormRouteQuery } from '@/pages/search/form/model/search-form-route';

function createTestRouter() {
	return createRouter({
		history: createMemoryHistory(),
		routes: [{ path: '/search', component: { template: '<div />' } }],
	});
}

describe('search form route ownership', () => {
	test('identifies query parameters that participate in form restoration', () => {
		expect(isFormOwnedQueryParameter('f.form')).toBe(true);
		expect(isFormOwnedQueryParameter('f.word')).toBe(true);
		expect(isFormOwnedQueryParameter('patt')).toBe(true);
		expect(isFormOwnedQueryParameter('filter')).toBe(true);
		expect(isFormOwnedQueryParameter('searchfield')).toBe(true);

		expect(isFormOwnedQueryParameter('query')).toBe(false);
		expect(isFormOwnedQueryParameter('cql')).toBe(false);
		expect(isFormOwnedQueryParameter('page')).toBe(false);
	});

	test('projects and replaces only form-owned query parameters', () => {
		const current = {
			'f.form': 'old',
			'f.word': 'old',
			patt: 'old-pattern',
			filter: 'old-filter',
			searchfield: 'old-field',
			page: '4',
			sort: ['year', 'asc'],
		};

		expect(pickFormOwnedQueryParameters(current)).toEqual({
			'f.form': 'old',
			'f.word': 'old',
			patt: 'old-pattern',
			filter: 'old-filter',
			searchfield: 'old-field',
		});
		expect(readCanonicalFormQuery(current)).toEqual({
			patt: 'old-pattern',
			filter: 'old-filter',
			searchfield: 'old-field',
		});
		expect(replaceFormRouteQuery(current, { 'f.form': 'extended', 'f.word': 'water' }, { patt: '[word="water"]', filter: null, searchfield: null })).toEqual({
			page: '4',
			sort: ['year', 'asc'],
			patt: '[word="water"]',
			'f.form': 'extended',
			'f.word': 'water',
		});
	});

	test('ignores pagination but reacts to form navigation and browser history', async () => {
		const router = createTestRouter();
		await router.push('/search?f.form=extended&f.word=water&page=1');
		await router.isReady();
		const restore = vi.fn();
		const stop = watch(
			() => formRouteFingerprint(router.currentRoute.value.query),
			() => restore(),
			{ flush: 'sync' },
		);

		await router.push({ query: { ...router.currentRoute.value.query, page: '2' } });
		expect(restore).not.toHaveBeenCalled();

		await router.push({ query: { ...router.currentRoute.value.query, 'f.word': 'fire', page: '1' } });
		expect(restore).toHaveBeenCalledTimes(1);

		router.back();
		await nextTick();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(router.currentRoute.value.query['f.word']).toBe('water');
		expect(restore).toHaveBeenCalledTimes(2);
		stop();
	});
});
