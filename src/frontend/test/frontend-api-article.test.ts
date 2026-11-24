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

test('sends the displayed and searched fields for parallel contents', async () => {
	const http = createMockHttp();
	const api = createFrontendApi({ baseUrl: '/frontend', user: null, axiosOptions: { adapter: http.adapter } });
	const request = api.getDocumentContents({ indexId: 'BaB', docId: 'bab0954', field: 'contents', searchfield: 'translation', patt: '[]', wordstart: 0, wordend: 269 });
	const sent = await http.nextRequest();
	expect(sent.config.url).toBe('BaB/api/docs/bab0954/contents');
	expect(Object.fromEntries(sent.query)).toEqual({ field: 'contents', wordstart: '0', wordend: '269', searchfield: 'translation', patt: '[]' });
	sent.respond('<article>Document</article>');
	await expect(request).resolves.toBe('<article>Document</article>');
});
// @vitest-environment jsdom
