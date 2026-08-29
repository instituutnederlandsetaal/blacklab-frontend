import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { type Endpoint, type EndpointSettings, createEndpoint } from '@/shared/api/lib/api-endpoint';
import { CancelableRequest, type BlackLabApi } from '@/shared/api/lib/api-types';

const mock = vi.hoisted(() => ({
	requests: [] as Array<{ method: string; url: string }>,
}));

vi.mock('@/shared/api/lib/api-endpoint', () => ({ createEndpoint: vi.fn() }));

function pendingRequest<T>() {
	return new CancelableRequest<T>(new Promise(() => {}), vi.fn());
}

function record(method: string) {
	return (url: string) => {
		mock.requests.push({ method, url });
		return pendingRequest();
	};
}

beforeEach(() => {
	mock.requests.length = 0;
	vi.mocked(createEndpoint)
		.mockReset()
		.mockReturnValue({
			deleteCancelable: record('DELETE'),
			getCancelable: record('GET'),
			getOrPostCancelable: record('GET_OR_POST'),
			postCancelable: record('POST'),
		} as unknown as Endpoint);
});

const corpusId = 'owner:corpus';
const routes: Array<{ name: string; invoke: (api: BlackLabApi) => CancelableRequest<unknown>; path: (prefix: string) => string; method: string }> = [
	{ name: 'server root', invoke: api => api.getServerInfo(), path: () => './', method: 'GET' },
	{ name: 'corpus status', invoke: api => api.getCorpusStatus(corpusId), path: prefix => `${prefix}${corpusId}/status/`, method: 'GET' },
	{
		name: 'annotated field',
		invoke: api => api.getAnnotatedField(corpusId, 'contents/nl'),
		path: prefix => `${prefix}${corpusId}/fields/contents%2Fnl/`,
		method: 'GET',
	},
	{ name: 'input format', invoke: api => api.getFormatContent('yaml/custom'), path: () => 'input-formats/yaml%2Fcustom/', method: 'GET' },
	{ name: 'input format XSLT', invoke: api => api.getFormatXslt('yaml/custom'), path: () => 'input-formats/yaml%2Fcustom/xslt', method: 'GET' },
	{
		name: 'document info',
		invoke: api => api.getDocumentInfo(corpusId, 'doc/42'),
		path: prefix => `${prefix}${corpusId}/docs/doc%2F42/`,
		method: 'GET_OR_POST',
	},
	{ name: 'hits', invoke: api => api.getHits(corpusId, { number: 20, patt: '[]' }), path: prefix => `${prefix}${corpusId}/hits/`, method: 'GET_OR_POST' },
	{
		name: 'snippet',
		invoke: api => api.getSnippet(corpusId, 'doc/42', 'contents', 1, 2),
		path: prefix => `${prefix}${corpusId}/docs/doc%2F42/snippet/`,
		method: 'GET_OR_POST',
	},
	{
		name: 'annotation autocomplete',
		invoke: api => api.getTermAutocomplete(corpusId, 'contents/nl', 'word/lemma', 'wat'),
		path: prefix => `${prefix}${corpusId}/autocomplete/contents%2Fnl/word%2Flemma/`,
		method: 'GET_OR_POST',
	},
	{
		name: 'metadata autocomplete',
		invoke: api => api.getMetadataAutocomplete(corpusId, 'meta/title', 'wat'),
		path: prefix => `${prefix}${corpusId}/autocomplete/meta%2Ftitle/`,
		method: 'GET_OR_POST',
	},
	{
		name: 'term frequencies',
		invoke: api => api.getTermFrequencies(corpusId, 'word'),
		path: prefix => `${prefix}${corpusId}/termfreq/`,
		method: 'GET_OR_POST',
	},
	{ name: 'delete corpus', invoke: api => api.deleteCorpus(corpusId), path: prefix => `${prefix}${corpusId}/`, method: 'DELETE' },
];

describe.each([
	{ apiVersion: '4', blacklabVersion: '4.2.0', prefix: '', mappedQuery: { patt: '[]', includetokencount: true } },
	{ apiVersion: '5', blacklabVersion: '5.0.0', prefix: 'corpora/', mappedQuery: undefined },
])('BlackLab $apiVersion paths', ({ apiVersion, blacklabVersion, prefix, mappedQuery }) => {
	test.each(routes)('$name', async ({ invoke, method, path }) => {
		const api = await createBlackLabApi({
			baseUrl: '/blacklab',
			user: null,
			blacklabVersion,
			axiosOptions: { params: { existing: 'value' } },
		});

		invoke(api).cancel();

		expect(mock.requests).toEqual([{ method, url: path(prefix) }]);
		const settings = vi.mocked(createEndpoint).mock.calls[0][0] as EndpointSettings;
		expect(settings.axiosOptions?.params).toEqual({ existing: 'value', api: apiVersion });
		expect(settings.mapQueryParams?.({ patt: '[]', subcorpussize: true })).toEqual(mappedQuery);
	});
});
