import { createMockHttp } from '@test/mocks/http';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { createFrontendApi, frontendPaths } from '@/shared/api/frontendApi';

beforeEach(() => {
	vi.stubGlobal('WITH_CREDENTIALS', false);
	vi.stubGlobal('CONTEXT_URL', '/frontend');
});
afterEach(() => vi.unstubAllGlobals());

test.each([
	{ mainField: 'contents', fieldName: 'contents', searchfield: 'contents', expected: { patt: '[]' } },
	{ mainField: 'contents__nl', fieldName: 'contents__en', searchfield: 'contents__nl', expected: { patt: '[]', field: 'contents__en', searchfield: 'contents__nl' } },
	{ mainField: 'contents__nl', fieldName: 'contents__en', searchfield: 'contents__en', expected: { patt: '[]', field: 'contents__en' } },
	{ mainField: 'contents__nl', fieldName: 'contents__nl', searchfield: 'contents__en', expected: { patt: '[]', searchfield: 'contents__en' } },
])('document links preserve necessary fields for $fieldName from $searchfield', ({ expected, mainField, ...fields }) => {
	const url = new URL(frontendPaths.documentPage({ id: 'corpus', mainAnnotatedField: mainField }, { pid: 'doc', patt: '[]', ...fields }));
	expect(Object.fromEntries(url.searchParams)).toEqual(expected);
});

test('default contents need neither field names nor word bounds', async () => {
	const http = createMockHttp();
	const api = createFrontendApi({ baseUrl: '/frontend', user: null, axiosOptions: { adapter: http.adapter } });
	const request = api.getDocumentContents({ indexId: 'BaB', docId: 'bab0954' });
	const sent = await http.nextRequest();
	expect(Object.fromEntries(sent.query)).toEqual({});
	sent.respond('Document');
	await request;
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
