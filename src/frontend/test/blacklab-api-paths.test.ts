import { createMockHttp } from '@test/mocks/http';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError, type CancelableRequest, type BlackLabApi } from '@/shared/api/lib/api-types';

beforeEach(() => vi.stubGlobal('WITH_CREDENTIALS', false));
afterEach(() => vi.unstubAllGlobals());

const corpusId = 'owner:corpus';
const routes: Array<{ name: string; invoke: (api: BlackLabApi) => CancelableRequest<unknown>; path: (prefix: string) => string; method: string }> = [
	{ name: 'corpus status', invoke: api => api.getCorpusStatus(corpusId), path: prefix => `${prefix}${corpusId}/status/`, method: 'get' },
	{
		name: 'annotated field',
		invoke: api => api.getAnnotatedField(corpusId, 'contents/nl'),
		path: prefix => `${prefix}${corpusId}/fields/contents%2Fnl/`,
		method: 'get',
	},
	{ name: 'input format', invoke: api => api.getFormatContent('yaml/custom'), path: () => 'input-formats/yaml%2Fcustom/', method: 'get' },
	{ name: 'input format XSLT', invoke: api => api.getFormatXslt('yaml/custom'), path: () => 'input-formats/yaml%2Fcustom/xslt', method: 'get' },
	{
		name: 'document info',
		invoke: api => api.getDocumentInfo(corpusId, 'doc/42'),
		path: prefix => `${prefix}${corpusId}/docs/doc%2F42/`,
		method: 'get',
	},
	{ name: 'hits', invoke: api => api.getHits(corpusId, { number: 20, patt: '[]' }), path: prefix => `${prefix}${corpusId}/hits/`, method: 'get' },
	{ name: 'collocations', invoke: api => api.getCollocations(corpusId, { patt: '[]' }), path: prefix => `${prefix}${corpusId}/collocations/`, method: 'get' },
	{
		name: 'snippet',
		invoke: api => api.getSnippet(corpusId, 'doc/42', 'contents', 1, 2),
		path: prefix => `${prefix}${corpusId}/docs/doc%2F42/snippet/`,
		method: 'get',
	},
	{
		name: 'annotation autocomplete',
		invoke: api => api.getTermAutocomplete(corpusId, 'contents/nl', 'word/lemma', 'wat'),
		path: prefix => `${prefix}${corpusId}/autocomplete/contents%2Fnl/word%2Flemma/`,
		method: 'get',
	},
	{
		name: 'metadata autocomplete',
		invoke: api => api.getMetadataAutocomplete(corpusId, 'meta/title', 'wat'),
		path: prefix => `${prefix}${corpusId}/autocomplete/meta%2Ftitle/`,
		method: 'get',
	},
	{
		name: 'term frequencies',
		invoke: api => api.getTermFrequencies(corpusId, 'word'),
		path: prefix => `${prefix}${corpusId}/termfreq/`,
		method: 'get',
	},
	{ name: 'delete corpus', invoke: api => api.deleteCorpus(corpusId), path: prefix => `${prefix}${corpusId}/`, method: 'delete' },
];

describe.each([
	{ apiVersion: '4', blacklabVersion: '4.2.0', prefix: '' },
	{ apiVersion: '5', blacklabVersion: '5.0.0', prefix: 'corpora/' },
	{ apiVersion: '5', blacklabVersion: '5.0.0-SNAPSHOT', prefix: 'corpora/' },
])('BlackLab $blacklabVersion paths', ({ apiVersion, blacklabVersion, prefix }) => {
	test('server root selects the API version and preserves existing query parameters', async () => {
		const http = createMockHttp();
		const api = await createBlackLabApi({
			baseUrl: '/blacklab',
			user: null,
			blacklabVersion,
			axiosOptions: { adapter: http.adapter, params: { existing: 'value' } },
		});
		const request = api.getServerInfo();
		const sent = await http.nextRequest();
		request.cancel();
		await expect(request).rejects.toBe(ApiError.CANCELLED);

		expect(sent.config).toMatchObject({ method: 'get', url: './' });
		expect(Object.fromEntries(sent.query)).toEqual({ existing: 'value', api: apiVersion });
	});

	test.each(routes)('$name', async ({ invoke, method, path }) => {
		const http = createMockHttp();
		const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion, axiosOptions: { adapter: http.adapter } });
		const request = invoke(api);
		const sent = await http.nextRequest();
		request.cancel();
		await expect(request).rejects.toBe(ApiError.CANCELLED);

		expect(sent.config).toMatchObject({ method, url: path(prefix) });
	});
});

test('regression: concurrent clients keep their transports, cancellations, and responses independent', async () => {
	const firstHttp = createMockHttp();
	const secondHttp = createMockHttp();
	const [firstApi, secondApi] = await Promise.all([
		createBlackLabApi({ baseUrl: '/first', user: null, blacklabVersion: '4.2.0', axiosOptions: { adapter: firstHttp.adapter } }),
		createBlackLabApi({ baseUrl: '/second', user: null, blacklabVersion: '5.0.0', axiosOptions: { adapter: secondHttp.adapter } }),
	]);
	const firstRequest = firstApi.getTermAutocomplete('first-corpus', 'contents', 'word', 'wat');
	const secondRequest = secondApi.getTermAutocomplete('second-corpus', 'contents', 'lemma', 'shi');
	const [firstSent, secondSent] = await Promise.all([firstHttp.nextRequest(), secondHttp.nextRequest()]);

	expect(firstSent.config).toMatchObject({ baseURL: '/first/', url: 'first-corpus/autocomplete/contents/word/' });
	expect(secondSent.config).toMatchObject({ baseURL: '/second/', url: 'corpora/second-corpus/autocomplete/contents/lemma/' });
	expect(Object.fromEntries(firstSent.query)).toEqual({ api: '4', term: 'wat' });
	expect(Object.fromEntries(secondSent.query)).toEqual({ api: '5', term: 'shi' });

	firstRequest.cancel();
	await expect(firstRequest).rejects.toBe(ApiError.CANCELLED);
	expect(firstSent.cancelled).toBe(true);
	expect(secondSent.cancelled).toBe(false);

	const retry = firstApi.getTermAutocomplete('first-corpus', 'contents', 'word', 'fir');
	const retried = await firstHttp.nextRequest();
	retried.respond(['fire']);
	secondSent.respond(['ship']);
	await expect(retry).resolves.toEqual(['fire']);
	await expect(secondRequest).resolves.toEqual(['ship']);
	expect(firstHttp.requests).toHaveLength(2);
	expect(secondHttp.requests).toHaveLength(1);
});
