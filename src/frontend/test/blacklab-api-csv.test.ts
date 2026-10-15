import { createMockHttp } from '@test/mocks/http';
import type { AxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { BLSearchParameters } from '@/types/blacklabtypes';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError, type BlackLabApi, type CancelableRequest } from '@/shared/api/lib/api-types';

beforeEach(() => vi.stubGlobal('WITH_CREDENTIALS', false));
afterEach(() => vi.unstubAllGlobals());

const csvCalls: Array<{
	name: string;
	endpoint: string;
	params: () => BLSearchParameters;
	invoke: (api: BlackLabApi, params: BLSearchParameters, config: AxiosRequestConfig) => CancelableRequest<Blob>;
}> = [
	{
		name: 'hits',
		endpoint: 'hits-csv/',
		params: () => ({ patt: '[]', filter: 'author:me', subcorpussize: true, first: 7, number: 25 }),
		invoke: (api, params, config) => api.getHitsCsv('owner:corpus', params, config),
	},
	{
		name: 'docs',
		endpoint: 'docs-csv/',
		params: () => ({ filter: 'author:me', subcorpussize: true, first: 7, number: 25 }),
		invoke: (api, params, config) => api.getDocsCsv('owner:corpus', params, config),
	},
];

describe.each([
	{ apiVersion: '4', blacklabVersion: '4.2.0', prefix: '' },
	{ apiVersion: '5', blacklabVersion: '5.0.0', prefix: 'corpora/' },
])('BlackLab $apiVersion CSV requests', ({ apiVersion, blacklabVersion, prefix }) => {
	test.each(csvCalls)('$name downloads all results as a blob without mutating its inputs', async ({ endpoint, invoke, params: createParams }) => {
		const http = createMockHttp();
		const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion, axiosOptions: { adapter: http.adapter } });
		const params = createParams();
		const originalParams = { ...params };
		const headers = { Accept: 'application/json', Authorization: 'Bearer token' };
		const configParams = { existing: 'value' };
		const originalTransform = vi.fn();
		const config: AxiosRequestConfig = { headers, params: configParams, responseType: 'json', transformResponse: originalTransform };
		const originalConfig = { ...config, headers: { ...headers }, params: { ...configParams } };

		const request = invoke(api, params, config);
		const sent = await http.nextRequest();
		expect(sent.config).toMatchObject({
			url: `${prefix}owner:corpus/${endpoint}`,
			method: 'get',
			responseType: 'blob',
			headers: { Accept: 'text/csv', Authorization: 'Bearer token' },
		});
		const { first: _first, number: _number, subcorpussize: _subcorpussize, ...expectedParams } = originalParams;
		expect(Object.fromEntries(sent.query)).toEqual({ ...expectedParams, api: apiVersion, [apiVersion === '4' ? 'includetokencount' : 'subcorpussize']: 'true', outputformat: 'csv' });
		sent.respond(new Blob(['one,two'], { type: 'text/csv' }));
		const blob = await request;
		expect(blob.type).toBe('text/plain;charset=utf-8');
		await expect(blob.text()).resolves.toBe('one,two');
		expect(originalTransform).not.toHaveBeenCalled();
		expect(params).toEqual(originalParams);
		expect(config).toEqual(originalConfig);
	});
});

test.each(csvCalls)('$name CSV download can be cancelled', async ({ invoke, params }) => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const request = invoke(api, params(), {});
	const sent = await http.nextRequest();
	request.cancel();
	await expect(request).rejects.toBe(ApiError.CANCELLED);
	expect(sent.cancelled).toBe(true);
});

test.each([undefined, ''])('hit CSV rejects patt %s without sending a request', async patt => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	await expect(api.getHitsCsv('owner:corpus', { patt, number: 25 })).rejects.toEqual(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
	expect(http.requests).toHaveLength(0);
});

test('long CSV POST leaves caller params and headers unchanged', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const headers = { Accept: 'application/json', Authorization: 'Bearer token' };
	const configParams = new URLSearchParams([
		['existing', 'value'],
		['repeated', 'first'],
		['repeated', 'second'],
	]);
	const originalEntries = [...configParams];
	const patt = 'x'.repeat(1100);
	const request = api.getHitsCsv('owner:corpus', { patt, number: 25 }, { headers, params: configParams });
	const sent = await http.nextRequest();
	expect(sent.config).toMatchObject({
		method: 'post',
		url: 'corpora/owner:corpus/hits-csv/',
		headers: { Accept: 'text/csv', Authorization: 'Bearer token', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
	});
	expect([...sent.query]).toEqual([...originalEntries, ['outputformat', 'csv']]);
	expect(Object.fromEntries(new URLSearchParams(sent.config.data))).toEqual({ patt, outputformat: 'csv' });
	sent.respond(new Blob(['csv'], { type: 'text/csv' }));
	await expect((await request).text()).resolves.toBe('csv');
	expect(headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer token' });
	expect([...configParams]).toEqual(originalEntries);
	expect(configParams).not.toHaveProperty('outputformat');
});
