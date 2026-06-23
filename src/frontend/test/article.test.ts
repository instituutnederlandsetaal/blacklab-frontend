import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import type { Input } from '@/pages/article/article';
import { createArticleStreams } from '@/pages/article/article';
import { ApiError, CancelableRequest, type BlackLabApi, type FrontendApi } from '@/shared/api/lib/api-types';
import { Loadable, LoadableState } from '@/shared/utils/loadable/loadable';
import { loadableFromStream, promiseFromLoadableStream } from '@/shared/utils/loadable/loadable-streams';

const ids = {
	MOCK_INDEX_ID: 'test',
	MOCK_DOC_ID: 'test',
};

type MockDocument = Awaited<ReturnType<BlackLabApi['getDocumentInfo']>>;

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

const mockMetadataFields = {
	pid: [ids.MOCK_DOC_ID],
	title: [''],
	date: [''],
} satisfies Record<string, string[]>;

const mockDocInfo = {
	tokenCounts: [{ fieldName: 'contents', tokenCount: 246 }],
	lengthInTokens: 246,
	mayView: true,
	...mockMetadataFields,
} satisfies MockDocument['docInfo'];

const values = {
	MOCK_HITS: {
		hits: [
			{ docPid: ids.MOCK_DOC_ID, start: 53, end: 54, left: {}, match: {}, right: {} },
			{ docPid: ids.MOCK_DOC_ID, start: 125, end: 126, left: {}, match: {}, right: {} },
			{ docPid: ids.MOCK_DOC_ID, start: 187, end: 188, left: {}, match: {}, right: {} },
		],
		docInfos: {
			[ids.MOCK_DOC_ID]: {
				tokenCounts: [{ fieldName: 'contents', tokenCount: 246 }],
				lengthInTokens: 246,
				mayView: true,
			},
		},
	},
	MOCK_DOC: {
		docPid: ids.MOCK_DOC_ID,
		docInfo: mockDocInfo,
		docFields: {
			pidField: 'pid',
			titleField: 'title',
			dateField: 'date',
		},
	} satisfies MockDocument,

	MOCK_ERROR: new ApiError('test', 'test', 'test', undefined),
};

function r<T>(v: T): (..._params: unknown[]) => CancelableRequest<T> {
	return () => new CancelableRequest(Promise.resolve(v), () => {});
}

function e<T>(): CancelableRequest<T> {
	return new CancelableRequest(Promise.reject(values.MOCK_ERROR), () => {});
}

function createTestStreams() {
	const blacklab = {
		getHits: r(values.MOCK_HITS),
		getDocumentInfo: (_indexId: string, docId: string) => (docId === values.MOCK_DOC.docPid ? r(values.MOCK_DOC)() : e()),
		getSnippet: r(values.MOCK_HITS.hits[0]),
	} as Partial<BlackLabApi> as BlackLabApi;

	const frontend = {
		getDocumentContents: r(''),
		getDocumentMetadata: r('<dl><dt>title</dt><dd>Test</dd></dl>'),
	} as Partial<FrontendApi> as FrontendApi;

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

		expect(hitsOutput).toMatchObject(Loadable.Loaded(values.MOCK_HITS.hits.map(h => [h.start, h.end])));
		hitsOutput.stop();
	});

	test('Should clear if no docId', async () => {
		const { hits$, input$ } = createTestStreams();
		const hitsOutput = loadableFromStream(hits$);

		input$.next({ ...baseInputs, docId: undefined });
		await promiseFromLoadableStream(hits$);

		expect(hitsOutput).toMatchObject(Loadable.Empty());
		hitsOutput.stop();
	});

	test('Should clear if no indexId', async () => {
		const { hits$, input$ } = createTestStreams();
		const hitsOutput = loadableFromStream(hits$);

		input$.next({ ...baseInputs, indexId: undefined });
		await promiseFromLoadableStream(hits$);

		expect(hitsOutput).toMatchObject(Loadable.Empty());
		hitsOutput.stop();
	});
});

describe('metadata$', () => {
	test('Should be empty initially', async () => {
		const { metadata$, input$ } = createTestStreams();
		const output = loadableFromStream(metadata$);

		input$.next({});
		await promiseFromLoadableStream(metadata$);

		expect(output).toMatchObject(Loadable.Empty());
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

		expect(output).toMatchObject(Loadable.Empty());
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

	test('Should set the pageSize to the doclength if not provided', async () => {
		const { validPaginationParameters$, input$ } = createTestStreams();
		const output = loadableFromStream(validPaginationParameters$);

		input$.next({
			...baseInputs,
			pageSize: undefined,
		});
		await promiseFromLoadableStream(validPaginationParameters$);

		expect(output.value).toMatchObject({ wordend: values.MOCK_DOC.docInfo.lengthInTokens });
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
