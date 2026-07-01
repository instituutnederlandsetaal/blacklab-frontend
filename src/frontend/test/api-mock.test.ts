import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { describe, expect, test } from 'vitest';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';

describe('createMockApi', () => {
	test('returns an installable plugin with rejected default API methods', async () => {
		const api = createMockApi();
		const request = api.blacklabApi.getCorpora();

		expect(api.install).toEqual(expect.any(Function));
		expect(request).toBeInstanceOf(CancelableRequest);
		await expect(request).rejects.toBeInstanceOf(ApiError);
		await expect(api.frontendApi.getHelp()).rejects.toMatchObject({
			title: 'Mock API method not configured',
			statusText: 'Mock API',
		});
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

	test('supports endpoint overrides for call-aware mocks', async () => {
		const api = createMockApi({
			overrides: {
				blacklab: {
					getTermAutocomplete: () => resolvedRequest(['water']),
				},
			},
		});

		await expect(api.blacklabApi.getTermAutocomplete('corpus', 'contents', 'word', 'wat')).resolves.toEqual(['water']);
	});
});
