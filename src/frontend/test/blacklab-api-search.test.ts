import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BLCollocationsParameters, BLHitGroupResults, BLHitResults, BLSearchParameters } from '@/types/blacklabtypes';

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
	mock.getOrPostCancelable.mockReturnValue(new CancelableRequest(new Promise(() => {}), mock.cancel));
	vi.mocked(ApiEndpointModule.createEndpoint).mockReturnValue({ getOrPostCancelable: mock.getOrPostCancelable } as unknown as ApiEndpointModule.Endpoint);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const searches: Array<{
	blacklabVersion: string;
	name: string;
	params: () => BLSearchParameters;
	invoke: (api: BlackLabApi, params: BLSearchParameters, config: AxiosRequestConfig) => CancelableRequest<unknown>;
}> = [
	{ blacklabVersion: '5.0.0', name: 'hits', params: () => ({ number: 10, patt: '[word="fox"]', subcorpussize: false }), invoke: (api, params, config) => api.getHits('owner:corpus', params, config) },
	{ blacklabVersion: '4.2.0', name: 'docs', params: () => ({ filter: 'author:me', number: 10, subcorpussize: false }), invoke: (api, params, config) => api.getDocs('owner:corpus', params, config) },
];

test.each(searches)('$name copies parameters, forwards config by identity, and chains cancellation', async ({ blacklabVersion, invoke, params: createParams }) => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion });
	const params = createParams();
	const originalParams = { ...params };
	const config: AxiosRequestConfig = { headers: { 'X-Test': 'exact-config' }, params: { trace: 'request' }, timeout: 321 };

	const request = invoke(api, params, config);
	const endpointRequest = mock.getOrPostCancelable.mock.results[0].value as CancelableRequest<unknown>;
	expect(request).not.toBe(endpointRequest);
	request.cancel();

	const [, sentParams, sentConfig] = mock.getOrPostCancelable.mock.calls[0] as [string, BLSearchParameters, AxiosRequestConfig];
	expect(sentParams).toEqual({ ...originalParams, subcorpussize: true });
	expect(sentParams).not.toBe(params);
	expect(sentConfig).toBe(config);
	expect(params).toEqual(originalParams);
	expect(mock.cancel).toHaveBeenCalledOnce();
});

test.each(['4.2.0', '5.0.0'])('getCollocations copies parameters, forces subcorpus totals, strips group, forwards config, and chains cancellation on BlackLab %s', async blacklabVersion => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion });
	const params: BLCollocationsParameters = {
		patt: '[word="water"]',
		collpatt: '[lemma="ship"]',
		colltype: 'proximity',
		context: 5,
		annotation: 'lemma',
		sensitive: false,
		scorertype: 'coll-dice',
		group: 'hit:word:s',
		subcorpussize: false,
	};
	const originalParams = { ...params };
	const config: AxiosRequestConfig = { headers: { 'X-Test': 'exact-config' }, timeout: 321 };

	const request = api.getCollocations('owner:corpus', params, config);
	const endpointRequest = mock.getOrPostCancelable.mock.results[0].value as CancelableRequest<unknown>;
	expect(request).not.toBe(endpointRequest);
	request.cancel();

	const [path, sentParams, sentConfig] = mock.getOrPostCancelable.mock.calls[0] as [string, BLCollocationsParameters, AxiosRequestConfig];
	const expectedParams = { ...originalParams };
	delete expectedParams.group;
	expect(path).toBe(blacklabVersion.startsWith('4') ? 'owner:corpus/collocations/' : 'corpora/owner:corpus/collocations/');
	expect(sentParams).toEqual({ ...expectedParams, subcorpussize: true });
	expect(sentParams).not.toHaveProperty('group');
	expect(sentParams).not.toBe(params);
	expect(sentConfig).toBe(config);
	expect(params).toEqual(originalParams);
	expect(mock.cancel).toHaveBeenCalledOnce();
});

test('getCollocations rejects a missing pattern before calling the endpoint', async () => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });
	await expect(api.getCollocations('owner:corpus', {} as BLCollocationsParameters)).rejects.toEqual(new ApiError('Info', 'Cannot get collocations without a pattern.', 'No results', undefined));
	expect(mock.getOrPostCancelable).not.toHaveBeenCalled();
});

test('getCollocations retains grouped-hit normalization', async () => {
	const raw = {
		hitGroups: [{ identity: 'ship', identityDisplay: 'ship', properties: [{ name: 'hit:lemma', value: 'ship' }], size: 2, numberOfDocs: 1 }],
		summary: { params: { patt: '[]', number: 20 }, results: {} },
	} as unknown as BLHitGroupResults;
	mock.getOrPostCancelable.mockReturnValueOnce(new CancelableRequest(Promise.resolve(raw), mock.cancel));
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });

	await expect(api.getCollocations('owner:corpus', { patt: '[]' })).resolves.toEqual({ hitGroups: raw.hitGroups, summary: raw.summary });
});

test('getCollocations returns normalized hits when a group is selected', async () => {
	const raw = {
		hits: [],
		docInfos: {},
		summary: { params: { patt: '[]', number: 20, viewgroup: 'lemma:ship' }, results: {} },
	} as unknown as BLHitResults;
	mock.getOrPostCancelable.mockReturnValueOnce(new CancelableRequest(Promise.resolve(raw), mock.cancel));
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });

	const request: CancelableRequest<BLHitResults> = api.getCollocations('owner:corpus', { patt: '[]', viewgroup: 'lemma:ship' });
	await expect(request).resolves.toEqual(raw);
	expect(mock.getOrPostCancelable).toHaveBeenCalledWith('corpora/owner:corpus/collocations/', { patt: '[]', viewgroup: 'lemma:ship', subcorpussize: true }, undefined);
});

test.each([
	{ blacklabVersion: '4.2.0', path: 'owner:corpus/docs/' },
	{ blacklabVersion: '5.0.0', path: 'corpora/owner:corpus/docs/' },
])('getDocs uses the $blacklabVersion path', async ({ blacklabVersion, path }) => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion });
	api.getDocs('owner:corpus', { number: 10 });
	expect(mock.getOrPostCancelable).toHaveBeenCalledWith(path, { number: 10, subcorpussize: true }, undefined);
});

test('getHits rejects a missing pattern before calling the endpoint', async () => {
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0' });
	await expect(api.getHits('owner:corpus', { number: 10 })).rejects.toEqual(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
	expect(mock.getOrPostCancelable).not.toHaveBeenCalled();
});

test('V4 endpoint serialization maps the forced subcorpus flag to includetokencount', async () => {
	vi.stubGlobal('WITH_CREDENTIALS', false);
	let axiosOptions: AxiosRequestConfig | undefined;
	const get = vi.fn().mockReturnValue(new Promise(() => {}));
	vi.spyOn(axios, 'create').mockImplementation(options => {
		axiosOptions = options;
		return { get, interceptors: { request: { use: vi.fn() } } } as unknown as AxiosInstance;
	});
	vi.mocked(ApiEndpointModule.createEndpoint).mockImplementationOnce(mock.actualCreateEndpoint);
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '4.2.0' });
	const params: BLSearchParameters = { number: 10, patt: '[word="fox"]', subcorpussize: false };

	const request = api.getHits('owner:corpus', params);
	const requestConfig = get.mock.calls[0][1] as AxiosRequestConfig;
	if (!axiosOptions?.paramsSerializer) throw new Error('Expected the endpoint to configure query serialization');
	const serialized = (axiosOptions.paramsSerializer as (params: unknown) => string)(requestConfig.params);
	request.cancel();

	expect(Object.fromEntries(new URLSearchParams(serialized))).toEqual({ includetokencount: 'true', number: '10', patt: '[word="fox"]' });
	expect(new URLSearchParams(serialized).has('subcorpussize')).toBe(false);
});
