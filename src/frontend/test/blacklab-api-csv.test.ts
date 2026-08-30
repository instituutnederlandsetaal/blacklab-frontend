import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { BLSearchParameters } from '@/types/blacklabtypes';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import * as ApiEndpointModule from '@/shared/api/lib/api-endpoint';
import { ApiError, type BlackLabApi, CancelableRequest } from '@/shared/api/lib/api-types';

const mock = vi.hoisted(() => ({
	actualCreateEndpoint: undefined as unknown as typeof ApiEndpointModule.createEndpoint,
	cancel: vi.fn(),
	getOrPostCancelable: vi.fn(),
}));

vi.mock('@/shared/api/lib/api-endpoint', async importOriginal => {
	const actual = await importOriginal<typeof ApiEndpointModule>();
	mock.actualCreateEndpoint = actual.createEndpoint;
	return { ...actual, createEndpoint: vi.fn() };
});

beforeEach(() => {
	vi.clearAllMocks();
	mock.getOrPostCancelable.mockReturnValue(new CancelableRequest<Blob>(new Promise(() => undefined), mock.cancel));
	vi.mocked(ApiEndpointModule.createEndpoint).mockReturnValue({ getOrPostCancelable: mock.getOrPostCancelable } as unknown as ApiEndpointModule.Endpoint);
});
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

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
	test.each(csvCalls)('$name preserves the request contract without mutating its inputs', async ({ endpoint, invoke, params: createParams }) => {
		const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion });
		const params = createParams();
		const originalParams = { ...params };
		const headers = { Accept: 'application/json', Authorization: 'Bearer token' };
		const configParams = { existing: 'value' };
		const originalTransform = vi.fn();
		const config: AxiosRequestConfig = { headers, params: configParams, responseType: 'json', transformResponse: originalTransform };

		const request = invoke(api, params, config);
		expect(request).toBe(mock.getOrPostCancelable.mock.results[0].value);
		request.cancel();
		expect(mock.cancel).toHaveBeenCalledOnce();

		expect(mock.getOrPostCancelable).toHaveBeenCalledOnce();
		const [url, csvParams, csvConfig] = mock.getOrPostCancelable.mock.calls[0] as [string, Record<string, unknown>, AxiosRequestConfig];
		expect(url).toBe(`${prefix}owner:corpus/${endpoint}`);
		const { first: _first, number: _number, ...expectedParams } = originalParams;
		expect(csvParams).toEqual({ ...expectedParams, outputformat: 'csv' });
		expect(csvParams).not.toBe(params);
		expect(csvConfig).not.toBe(config);
		expect(csvConfig.params).toEqual(configParams);
		expect(csvConfig.params).not.toBe(configParams);
		expect(csvConfig.headers).toEqual({ Accept: 'text/csv', Authorization: 'Bearer token' });
		expect(csvConfig.headers).not.toBe(headers);
		expect(csvConfig.responseType).toBe('blob');
		expect(csvConfig.transformResponse).not.toBe(originalTransform);
		const blob = (csvConfig.transformResponse as (data: unknown) => Blob)('one,two');
		expect(blob.type).toBe('text/plain;charset=utf-8');
		await expect(blob.text()).resolves.toBe('one,two');

		expect(params).toEqual(originalParams);
		expect(config).toMatchObject({ headers, params: configParams, responseType: 'json', transformResponse: originalTransform });
		const endpointSettings = vi.mocked(ApiEndpointModule.createEndpoint).mock.calls[0][0] as ApiEndpointModule.EndpointSettings;
		const { subcorpussize, ...v4Params } = expectedParams;
		expect(endpointSettings.mapQueryParams?.(csvParams)).toEqual(apiVersion === '4' ? { ...v4Params, outputformat: 'csv', includetokencount: subcorpussize } : undefined);
	});
});

test.each([undefined, ''])('hit CSV rejects patt %s without calling the endpoint', async patt => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });
	const request = api.getHitsCsv('owner:corpus', { patt, number: 25 });
	await expect(request).rejects.toEqual(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
	expect(mock.getOrPostCancelable).not.toHaveBeenCalled();
});

test('long CSV POST leaves caller params and headers unchanged', async () => {
	vi.stubGlobal('WITH_CREDENTIALS', false);
	const post = vi.fn().mockResolvedValue({ data: new Blob(['csv']) });
	vi.spyOn(axios, 'create').mockReturnValue({
		interceptors: { request: { use: vi.fn() } },
		post,
	} as unknown as AxiosInstance);
	vi.mocked(ApiEndpointModule.createEndpoint).mockImplementationOnce(mock.actualCreateEndpoint);
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });
	const headers = { Accept: 'application/json', Authorization: 'Bearer token' };
	const configParams = new URLSearchParams([
		['existing', 'value'],
		['repeated', 'first'],
		['repeated', 'second'],
	]);
	const originalEntries = [...configParams];

	await api.getHitsCsv('owner:corpus', { patt: 'x'.repeat(1100), number: 25 }, { headers, params: configParams });

	expect(post).toHaveBeenCalledOnce();
	const postedParams = post.mock.calls[0][2].params as URLSearchParams & { outputformat?: string };
	expect(post.mock.calls[0][2]).toMatchObject({
		headers: { Accept: 'text/csv', Authorization: 'Bearer token', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
	});
	expect(postedParams).toBeInstanceOf(URLSearchParams);
	expect(postedParams).not.toBe(configParams);
	expect([...postedParams]).toEqual(originalEntries);
	expect(postedParams.outputformat).toBe('csv');
	expect(headers).toEqual({ Accept: 'application/json', Authorization: 'Bearer token' });
	expect([...configParams]).toEqual(originalEntries);
	expect(configParams.has('outputformat')).toBe(false);
	expect(configParams).not.toHaveProperty('outputformat');
});
