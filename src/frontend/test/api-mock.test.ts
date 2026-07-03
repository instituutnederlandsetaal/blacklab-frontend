import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

describe('createMockApi', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('returns an installable plugin with rejected default API methods', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const api = createMockApi();
		const request = api.blacklabApi.getCorpora();

		expect(api.install).toEqual(expect.any(Function));
		expect(request).toBeInstanceOf(CancelableRequest);
		await expect(request).rejects.toBeInstanceOf(ApiError);
		expect(warn).toHaveBeenCalledWith('Mock API method "blacklab.getCorpora" was called without a configured return value.');
		await expect(api.frontendApi.getHelp()).rejects.toMatchObject({
			title: 'Mock API method not configured',
			statusText: 'Mock API',
		});
		expect(warn).toHaveBeenCalledWith('Mock API method "frontend.getHelp" was called without a configured return value.');
	});

	test('returns configured values through CancelableRequest', async () => {
		const api = createMockApi({
			blacklab: {
				getCorpora: [],
			},
			frontend: {
				getHelp: '<p>Help</p>',
				getTagset: undefined,
			},
		});

		await expect(api.blacklabApi.getCorpora()).resolves.toEqual([]);
		await expect(api.frontendApi.getHelp()).resolves.toBe('<p>Help</p>');
		await expect(api.frontendApi.getTagset('test')).resolves.toBeUndefined();
	});

	test('supports call-aware mocks in the configured values map', async () => {
		const getTermAutocomplete = vi.fn((indexId: string, _field: string, _annotation: string, prefix: string) => resolvedRequest([`${indexId}:${prefix}`]));
		const api = createMockApi({
			blacklab: {
				getTermAutocomplete,
			},
		});

		await expect(api.blacklabApi.getTermAutocomplete('corpus', 'contents', 'word', 'wat')).resolves.toEqual(['corpus:wat']);
		expect(getTermAutocomplete).toHaveBeenCalledWith('corpus', 'contents', 'word', 'wat');
	});
});
