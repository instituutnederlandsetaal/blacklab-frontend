import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { createMockHttp } from './mocks/http';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError } from '@/shared/api/lib/api-types';

beforeEach(() => vi.stubGlobal('WITH_CREDENTIALS', false));
afterEach(() => vi.unstubAllGlobals());

test('preserves the BlackLab error for a missing corpus', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const request = api.getCorpus('test');
	const result = request.request.catch(cause => cause);
	const sent = await http.nextRequest();
	sent.respond({ error: { code: 'CANNOT_OPEN_INDEX', message: "Could not open index 'test'. Please check the name." } }, 404, 'Not Found');
	const error = await result;
	expect(error).toBeInstanceOf(ApiError);
	expect(error).toMatchObject({ title: 'CANNOT_OPEN_INDEX', message: "Could not open index 'test'. Please check the name.", statusText: 'Not Found', httpCode: 404 });
});

test('preserves other 404 responses without adding corpus-specific wording', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const request = api.getCorpus('test');
	const result = request.request.catch(cause => cause);
	const sent = await http.nextRequest();
	sent.respond({ error: { code: 'NOT_FOUND', message: 'No resource at this path' } }, 404, 'Not Found');
	const error = await result;
	expect(error).toBeInstanceOf(ApiError);
	expect(error).toMatchObject({ title: 'NOT_FOUND', message: 'No resource at this path', statusText: 'Not Found', httpCode: 404 });
});
