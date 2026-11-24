import { createMockHttp } from '@test/mocks/http';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { createFrontendApi } from '@/shared/api/frontendApi';

beforeEach(() => {
	vi.stubGlobal('WITH_CREDENTIALS', false);
	vi.stubGlobal('CONTEXT_URL', '/frontend');
});
afterEach(() => vi.unstubAllGlobals());

test('default contents need neither field names nor word bounds', async () => {
	const http = createMockHttp();
	const api = createFrontendApi({ baseUrl: '/frontend', user: null, axiosOptions: { adapter: http.adapter } });
	const request = api.getDocumentContents({ indexId: 'BaB', docId: 'vol/1?#' });
	const sent = await http.nextRequest();
	expect(sent.config.url).toBe('BaB/api/docs/vol%2F1%3F%23/contents');
	expect(Object.fromEntries(sent.query)).toEqual({});
	sent.respond('Document');
	await request;
	const metadata = api.getDocumentMetadata('BaB', 'vol/1?#');
	const metaRequest = await http.nextRequest();
	expect(metaRequest.config.url).toBe('BaB/api/docs/vol%2F1%3F%23');
	metaRequest.respond('Metadata');
	await metadata;
});

test.each([
	{ searchfield: 'contents', patt: undefined, expected: {} },
	{ searchfield: 'translation', patt: undefined, expected: {} },
	{ searchfield: 'contents', patt: '[]', expected: { patt: '[]' } },
	{ searchfield: 'translation', patt: '[]', expected: { patt: '[]', searchfield: 'translation' } },
])('document contents sends only backend parameters for $searchfield and $patt', async ({ searchfield, patt, expected }) => {
	const http = createMockHttp();
	const api = createFrontendApi({ baseUrl: '/frontend', user: null, axiosOptions: { adapter: http.adapter } });
	const request = api.getDocumentContents({ indexId: 'BaB', docId: 'bab0954', viewField: 'contents', searchfield, patt, wordstart: 0, wordend: 269 });
	const sent = await http.nextRequest();
	expect(sent.config.url).toBe('BaB/api/docs/bab0954/contents');
	expect(Object.fromEntries(sent.query)).toEqual({ field: 'contents', wordstart: '0', wordend: '269', ...expected });
	sent.respond('<article>Document</article>');
	await expect(request).resolves.toBe('<article>Document</article>');
});
// @vitest-environment jsdom
