import { createMockHttp } from '@test/mocks/http';
import type { AxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BLCollocationsParameters, BLSearchParameters } from '@/types/blacklabtypes';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError, type BlackLabApi, type CancelableRequest } from '@/shared/api/lib/api-types';

beforeEach(() => vi.stubGlobal('WITH_CREDENTIALS', false));
afterEach(() => vi.unstubAllGlobals());

const searches: Array<{
	blacklabVersion: string;
	name: string;
	path: string;
	params: () => BLSearchParameters;
	invoke: (api: BlackLabApi, params: BLSearchParameters, config: AxiosRequestConfig) => CancelableRequest<unknown>;
}> = [
	{
		blacklabVersion: '5.0.0',
		name: 'hits',
		path: 'corpora/owner:corpus/hits/',
		params: () => ({ number: 10, patt: '[word="fox"]', subcorpussize: false }),
		invoke: (api, params, config) => api.getHits('owner:corpus', params, config),
	},
	{
		blacklabVersion: '4.2.0',
		name: 'docs',
		path: 'owner:corpus/docs/',
		params: () => ({ filter: 'author:me', number: 10, subcorpussize: false }),
		invoke: (api, params, config) => api.getDocs('owner:corpus', params, config),
	},
];

test.each(searches)('$name preserves caller inputs, requests subcorpus totals, and supports cancellation', async ({ blacklabVersion, path, invoke, params: createParams }) => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion, axiosOptions: { adapter: http.adapter } });
	const params = createParams();
	const originalParams = { ...params };
	const config: AxiosRequestConfig = { headers: { 'X-Test': 'exact-config' }, timeout: 321 };
	const originalConfig = structuredClone(config);

	const request = invoke(api, params, config);
	const sent = await http.nextRequest();
	const { subcorpussize: _subcorpussize, ...expectedParams } = originalParams;
	const v4 = blacklabVersion.startsWith('4');
	expect(sent.config).toMatchObject({ url: path, method: 'get', headers: config.headers, timeout: config.timeout });
	expect(Object.fromEntries(sent.query)).toEqual({
		...Object.fromEntries(Object.entries(expectedParams).map(([key, value]) => [key, String(value)])),
		api: v4 ? '4' : '5',
		[v4 ? 'includetokencount' : 'subcorpussize']: 'true',
	});
	expect(params).toEqual(originalParams);
	expect(config).toEqual(originalConfig);

	request.cancel();
	await expect(request).rejects.toBe(ApiError.CANCELLED);
	expect(sent.cancelled).toBe(true);
});

test.each(['4.2.0', '5.0.0'])('getCollocations preserves caller inputs, omits client grouping, and supports cancellation on BlackLab %s', async blacklabVersion => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion, axiosOptions: { adapter: http.adapter } });
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
	const originalConfig = structuredClone(config);

	const request = api.getCollocations('owner:corpus', params, config);
	const sent = await http.nextRequest();
	const { group: _group, subcorpussize: _subcorpussize, ...expectedParams } = originalParams;
	const v4 = blacklabVersion.startsWith('4');
	expect(Object.fromEntries(sent.query)).toEqual({
		...Object.fromEntries(Object.entries(expectedParams).map(([key, value]) => [key, String(value)])),
		api: v4 ? '4' : '5',
		[v4 ? 'includetokencount' : 'subcorpussize']: 'true',
	});
	expect(sent.config).toMatchObject({ headers: config.headers, timeout: config.timeout });
	expect(params).toEqual(originalParams);
	expect(config).toEqual(originalConfig);

	request.cancel();
	await expect(request).rejects.toBe(ApiError.CANCELLED);
	expect(sent.cancelled).toBe(true);
});

test('getCollocations rejects a missing pattern before sending a request', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	await expect(api.getCollocations('owner:corpus', {} as BLCollocationsParameters)).rejects.toEqual(new ApiError('Info', 'Cannot get collocations without a pattern.', 'No results', undefined));
	expect(http.requests).toHaveLength(0);
});

test('getCollocations returns grouped results', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const raw = {
		hitGroups: [{ identity: 'ship', identityDisplay: 'ship', properties: [{ name: 'hit:lemma', value: 'ship' }], size: 2, numberOfDocs: 1 }],
		summary: { params: { patt: '[]', number: 20 }, results: {} },
	};
	const request = api.getCollocations('owner:corpus', { patt: '[]' });
	(await http.nextRequest()).respond(raw);
	await expect(request).resolves.toEqual(raw);
});

test('getCollocations returns hits when a group is selected', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const raw = { hits: [], docInfos: {}, summary: { params: { patt: '[]', number: 20, viewgroup: 'lemma:ship' }, results: {} } };
	const request = api.getCollocations('owner:corpus', { patt: '[]', viewgroup: 'lemma:ship' });
	const sent = await http.nextRequest();
	expect(sent.config.url).toBe('corpora/owner:corpus/collocations/');
	expect(Object.fromEntries(sent.query)).toEqual({ api: '5', patt: '[]', viewgroup: 'lemma:ship', subcorpussize: 'true' });
	sent.respond(raw);
	await expect(request).resolves.toEqual(raw);
});

test('getDocs uses the 5.0.0 path', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	const request = api.getDocs('owner:corpus', { number: 10 });
	const sent = await http.nextRequest();
	expect(sent.config.url).toBe('corpora/owner:corpus/docs/');
	expect(Object.fromEntries(sent.query)).toEqual({ api: '5', number: '10', subcorpussize: 'true' });
	request.cancel();
	await expect(request).rejects.toBe(ApiError.CANCELLED);
});

test('getHits rejects a missing pattern before sending a request', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: http.adapter } });
	await expect(api.getHits('owner:corpus', { number: 10 })).rejects.toEqual(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
	expect(http.requests).toHaveLength(0);
});

test('V4 endpoint serialization maps the forced subcorpus flag to includetokencount', async () => {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: '4.2.0', axiosOptions: { adapter: http.adapter } });
	const request = api.getHits('owner:corpus', { number: 10, patt: '[word="fox"]', subcorpussize: false });
	const sent = await http.nextRequest();
	expect(Object.fromEntries(sent.query)).toEqual({ api: '4', includetokencount: 'true', number: '10', patt: '[word="fox"]' });
	request.cancel();
	await expect(request).rejects.toBe(ApiError.CANCELLED);
});
