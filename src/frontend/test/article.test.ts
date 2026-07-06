import { createMockApi, rejectedRequest, resolvedRequest } from '@test/mocks/api';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { Input } from '@/pages/article/article';
import { createArticleStreams } from '@/pages/article/article';
import { type BLDocInfo, type BLHitInDoc, type BLHitResults, type BLDocument } from '@/types/blacklabtypes';

import { ApiError, type DocumentContentsParameters } from '@/shared/api/lib/api-types';
import { LoadableState } from '@/shared/utils/loadable/loadable-core';
import { loadableFromStream, promiseFromLoadableStream } from '@/shared/utils/loadable/loadable-stream';

const ids = {
	MOCK_INDEX_ID: 'test',
	MOCK_DOC_ID: 'test',
};

beforeAll(() => {
	vi.stubGlobal('document', {
		createElement: () => ({
			innerHTML: '',
			querySelectorAll: () => [],
		}),
	});
});

afterAll(() => {
	vi.unstubAllGlobals();
});
const mock_hit_in_doc: BLHitInDoc = {
	after: { punct: [] },
	before: { punct: [] },
	match: { punct: [] },
};

const mock_doc_info: BLDocInfo = {
	tokenCounts: [{ fieldName: 'contents', tokenCount: 246 }],
	mayView: true,
	metadata: {
		pid: [ids.MOCK_DOC_ID],
		title: [''],
		date: [''],
	},
};

const values = {
	MOCK_HITS: {
		hits: [
			{ docPid: ids.MOCK_DOC_ID, start: 53, end: 54, ...mock_hit_in_doc },
			{ docPid: ids.MOCK_DOC_ID, start: 125, end: 126, ...mock_hit_in_doc },
			{ docPid: ids.MOCK_DOC_ID, start: 187, end: 188, ...mock_hit_in_doc },
		],
		docInfos: {
			[ids.MOCK_DOC_ID]: mock_doc_info,
		},
		summary: {
			params: {
				number: 3,
			},
			results: {
				window: {
					firstResult: 0,
					requestedSize: 0,
					actualSize: 0,
					hasPrevious: false,
					hasNext: false,
				},
				stats: {
					processed: {
						status: 'finished',
						hits: undefined,
						documents: 0,
						timeMs: 0,
						stoppedBecauseTooMany: false,
					},
					counted: {
						status: 'finished',
						hits: undefined,
						documents: 0,
						timeMs: 0,
						stoppedBecauseTooMany: false,
					},
					numberOfGroups: undefined,
					largestGroupSize: undefined,
					subcorpusSize: undefined,
				},
				sample: {
					sample: 0,
					seed: 0,
				},
			},
		},
	} satisfies BLHitResults,
	MOCK_DOC: {
		docPid: ids.MOCK_DOC_ID,
		docInfo: mock_doc_info,
		docFields: {
			pidField: 'pid',
			titleField: 'title',
			dateField: 'date',
		},
	} satisfies BLDocument,

	MOCK_ERROR: new ApiError('test', 'test', 'test', undefined),
};

function createTestStreams() {
	const { blacklabApi: blacklab, frontendApi: frontend } = createMockApi({
		blacklab: {
			getHits: values.MOCK_HITS,
			getDocumentInfo: (_indexId, docId) => (docId === values.MOCK_DOC.docPid ? resolvedRequest(values.MOCK_DOC) : rejectedRequest(values.MOCK_ERROR)),
			getSnippet: values.MOCK_HITS.hits[0],
		},
		frontend: {
			getDocumentContents: '',
			getDocumentMetadata: '<dl><dt>title</dt><dd>Test</dd></dl>',
		},
	});

	return createArticleStreams(blacklab, frontend);
}

const baseInputs: Input = {
	patt: '"test"',
	findhit: 1,
	wordstart: 0,
	wordend: 1000,
	pageSize: 10,
	indexId: ids.MOCK_INDEX_ID,
	docId: ids.MOCK_DOC_ID,
	searchfield: 'contents',
	viewField: 'contents',
};

describe('hits$', () => {
	test('should be empty initially', () => {
		const { hits$ } = createTestStreams();
		const hitsOutput = loadableFromStream(hits$);

		expect(hitsOutput).toMatchObject({ state: LoadableState.empty });
		hitsOutput.stop();
	});

	test('Should find the hits', async () => {
		const { hits$, input$ } = createTestStreams();
		const hitsOutput = loadableFromStream(hits$);

		input$.next(baseInputs);
		await promiseFromLoadableStream(hits$);

		expect(hitsOutput.state).toBe(LoadableState.loaded);
		expect(hitsOutput.value).toEqual(values.MOCK_HITS.hits.map(h => [h.start, h.end]));
		hitsOutput.stop();
	});

	test('Should clear if no docId', async () => {
		const { hits$, input$ } = createTestStreams();
		const hitsOutput = loadableFromStream(hits$);

		input$.next({ ...baseInputs, docId: undefined });
		await promiseFromLoadableStream(hits$);

		expect(hitsOutput.state).toBe(LoadableState.empty);
		expect(hitsOutput.value).toBeUndefined();
		expect(hitsOutput.error).toBeUndefined();
		hitsOutput.stop();
	});

	test('Should clear if no indexId', async () => {
		const { hits$, input$ } = createTestStreams();
		const hitsOutput = loadableFromStream(hits$);

		input$.next({ ...baseInputs, indexId: undefined });
		await promiseFromLoadableStream(hits$);

		expect(hitsOutput.state).toBe(LoadableState.empty);
		expect(hitsOutput.value).toBeUndefined();
		expect(hitsOutput.error).toBeUndefined();
		hitsOutput.stop();
	});
});

describe('metadata$', () => {
	test('Should be empty initially', async () => {
		const { metadata$, input$ } = createTestStreams();
		const output = loadableFromStream(metadata$);

		input$.next({});
		await promiseFromLoadableStream(metadata$);

		expect(output.state).toBe(LoadableState.empty);
		expect(output.value).toBeUndefined();
		expect(output.error).toBeUndefined();
		output.stop();
	});

	test('Should load the metadata', async () => {
		const { metadata$, input$ } = createTestStreams();
		const output = loadableFromStream(metadata$);

		input$.next(baseInputs);
		await promiseFromLoadableStream(metadata$);

		expect(output.value).toMatchObject({
			json: values.MOCK_DOC,
			html: { innerHTML: '<dl><dt>title</dt><dd>Test</dd></dl>' },
		});
		output.stop();
	});
});

describe('validPaginationParameters$', () => {
	test('Should be empty initially', () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({});

		expect(output.state).toBe(LoadableState.empty);
		expect(output.value).toBeUndefined();
		expect(output.error).toBeUndefined();
		output.stop();
	});

	test('Should fix the pagination parameters to match the findHit', async () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({
			...baseInputs,
			findhit: values.MOCK_HITS.hits[0].start,
			pageSize: 10,
			wordstart: 0,
			wordend: 1000,
		});
		await promiseFromLoadableStream(validPaginationParameters$);
		expect(output.value).toMatchObject({
			wordstart: 50,
			wordend: 60,
		});

		input$.next({
			...baseInputs,
			findhit: values.MOCK_HITS.hits[0].start,
			pageSize: 100,
			wordstart: 0,
			wordend: 1000,
		});
		await promiseFromLoadableStream(validPaginationParameters$);
		expect(output.value).toMatchObject({
			wordstart: 0,
			wordend: 100,
			findhit: values.MOCK_HITS.hits[0].start,
		});
		output.stop();
	});

	test('Should clear the findhit if invalid', async () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({
			...baseInputs,
			findhit: 10000,
		});
		await promiseFromLoadableStream(validPaginationParameters$);

		expect(output.value).toMatchObject({ findhit: undefined });
		output.stop();
	});

	test('Should disable pagination if the pageSize is not provided', async () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({
			...baseInputs,
			pageSize: undefined,
		});
		await promiseFromLoadableStream(validPaginationParameters$);

		expect(output.value).toMatchObject({
			pageSize: null,
			wordstart: 0,
			wordend: values.MOCK_DOC.docInfo.tokenCounts[0].tokenCount,
			page: 0,
			maxPage: 0,
		});
		output.stop();
	});

	test('Should not add a phantom page when the document length is an exact multiple of pageSize', async () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({
			...baseInputs,
			findhit: undefined,
			pageSize: 123,
			wordstart: 0,
			wordend: 123,
		});
		await promiseFromLoadableStream(validPaginationParameters$);

		expect(output.value).toMatchObject({
			page: 0,
			maxPage: 1,
		});
		output.stop();
	});

	test('Should expose the error as a Loadable if the doc is not found', async () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({
			...baseInputs,
			docId: 'notfound',
		});

		await expect(promiseFromLoadableStream(validPaginationParameters$)).rejects.toMatchObject({ statusText: 'test' });
		expect(output).toMatchObject({ state: LoadableState.error });
		output.stop();
	});
});

describe('hitToHighlight$', () => {
	test('Should use the last hit as the inactive navigation target after the final hit', async () => {
		const { hitToHighlight$, input$ } = createTestStreams();
		const output = loadableFromStream(hitToHighlight$);

		input$.next({
			...baseInputs,
			findhit: undefined,
			pageSize: 10,
			wordstart: 230,
			wordend: 240,
		});
		await promiseFromLoadableStream(hitToHighlight$);

		expect(output.value).toMatchObject({
			totalHits: values.MOCK_HITS.hits.length,
			hitIndexToHighlight: values.MOCK_HITS.hits.length - 1,
			isHitVisible: false,
		});
		output.stop();
	});
});

describe('contents$', () => {
	test('Should request unbounded document contents when pagination is disabled', async () => {
		const getDocumentContents = vi.fn((_params: DocumentContentsParameters) => resolvedRequest(''));
		const { blacklabApi: blacklab, frontendApi: frontend } = createMockApi({
			blacklab: {
				getHits: values.MOCK_HITS,
				getDocumentInfo: values.MOCK_DOC,
			},
			frontend: {
				getDocumentContents,
				getDocumentMetadata: '<dl><dt>title</dt><dd>Test</dd></dl>',
			},
		});
		const { contents$, input$ } = createArticleStreams(blacklab, frontend);

		input$.next({
			...baseInputs,
			pageSize: null,
			wordstart: 10,
			wordend: 20,
		});
		await promiseFromLoadableStream(contents$);

		const params = getDocumentContents.mock.calls[0][0];
		expect(params).not.toHaveProperty('wordstart');
		expect(params).not.toHaveProperty('wordend');
	});
});
