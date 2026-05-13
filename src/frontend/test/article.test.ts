import { afterAll, describe, expect, test, vi } from 'vitest';

import type { BLDoc } from '@/_new/types/blacklabtypes';
import type { Input } from '@/pages/article/article';
import { hits$, input$, metadata$, validPaginationParameters$ } from '@/pages/article/article';

import { CancelableRequest } from '@/_new/shared/api/lib/api-types';
import { Loadable, LoadableState } from '@/_new/shared/utils/loadable/loadable';
import { loadableFromStream, promiseFromLoadableStream } from '@/_new/shared/utils/loadable/loadable-streams';

const ids = vi.hoisted(() => ({
	MOCK_INDEX_ID: 'test',
	MOCK_DOC_ID: 'test',
}));

const values = vi.hoisted(() => ({
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
		docInfo: {
			tokenCounts: [{ fieldName: 'contents', tokenCount: 246 }],
			lengthInTokens: 246,
			mayView: true,
			pid: [ids.MOCK_DOC_ID],
			title: [''],
			date: [''],
		},
		docFields: {
			pidField: 'pid',
			titleField: 'title',
			dateField: 'date',
		},
	} as any as BLDoc, // blech, could probably remove the any, but hard

	MOCK_ERROR: {
		title: 'test',
		message: 'test',
		statusText: 'test',
		httpCode: undefined,
	},
}));

function r<T>(v: T): (...params: any[]) => CancelableRequest<T> {
	return () => new CancelableRequest(Promise.resolve(v), () => {});
}
function e<T>(): CancelableRequest<T> {
	return new CancelableRequest(Promise.reject(values.MOCK_ERROR), () => {});
}

// Mock the api objects.
vi.mock('@/api', () => ({
	blacklab: {
		getHits: r(values.MOCK_HITS),
		getDocumentInfo: (_indexId: string, docId: string) => (docId === values.MOCK_DOC.docPid ? r(values.MOCK_DOC)() : e()),
	},
	frontend: {
		getDocumentContents: r<string>(''),
	},
}));

const baseInputs: Input = {
	patt: '"test"',
	findhit: 1,
	wordstart: 0,
	wordend: 1000,
	pageSize: 10,
	indexId: ids.MOCK_INDEX_ID,
	docId: ids.MOCK_DOC_ID,
};

describe('hits$', () => {
	// For ease of use, we'll use a LoadableFromStream object to test the hits$ observable.
	// We have separate tests to validate the behavior of the LoadableFromStream object.
	const hitsOutput = loadableFromStream(hits$);
	test('should be empty initially', () => expect(hitsOutput).toMatchObject({ state: 'empty' }));
	test('Should find the hits', async () => {
		input$.next(baseInputs);
		await promiseFromLoadableStream(hits$); // needs a moment to get the hits.
		expect(hitsOutput).toMatchObject(Loadable.Loaded(values.MOCK_HITS.hits.map(h => [h.start, h.end])));
	});
	test('Should clear if no docId', async () => {
		input$.next({ ...baseInputs, docId: undefined });
		await promiseFromLoadableStream(hits$);
		expect(hitsOutput).toMatchObject(Loadable.Empty());
	});
	test('Should clear if no indexId', async () => {
		input$.next({ ...baseInputs, indexId: undefined });
		await promiseFromLoadableStream(hits$);
		expect(hitsOutput).toMatchObject(Loadable.Empty());
	});
	afterAll(() => hitsOutput.stop());
});

describe('metadata$', () => {
	const output = loadableFromStream(metadata$);
	test('Should be empty initially', async () => {
		input$.next({});
		await promiseFromLoadableStream(metadata$); // wait for the metadata to load.
		expect(output).toMatchObject(Loadable.Empty());
	});

	test('Should load the metadata', async () => {
		input$.next(baseInputs);
		await promiseFromLoadableStream(metadata$); // wait for the metadata to load.
		expect(output).toMatchObject(Loadable.Loaded(values.MOCK_DOC));
	});

	afterAll(() => output.stop());
});

// Take care to perform setup code ONLY inside beforeEach, beforeAll, or the test itself.
// Code in test() calls is not guaranteed to run immediately.
// So if there are global/reused variables that are modified outside the test, they may not be in the state you expect.

describe('validPaginationParameters$', () => {
	const output = loadableFromStream(validPaginationParameters$);
	test('Should be empty initially', () => {
		input$.next({});
		expect(output).toMatchObject(Loadable.Empty());
	});
	test('Should fix the pagination parameters to match the findHit', async () => {
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
	});
	test('Should clear the findhit if invalid', async () => {
		input$.next({
			...baseInputs,
			findhit: 10000,
		});
		await promiseFromLoadableStream(validPaginationParameters$);
		expect(output.value).toMatchObject({ findhit: undefined });
	});
	test('Should set the pageSize to the doclength if not provided', async () => {
		input$.next({
			...baseInputs,
			pageSize: undefined,
		});
		await promiseFromLoadableStream(validPaginationParameters$);
		expect(output.value).toMatchObject({ wordend: values.MOCK_DOC.docInfo.lengthInTokens });
	});
	test('Should expose the error as a Loadable if the doc is not found', async () => {
		input$.next({
			...baseInputs,
			docId: 'notfound',
		});
		await expect(promiseFromLoadableStream(validPaginationParameters$)).rejects.toMatchObject({ statusText: 'test' });
		expect(output).toMatchObject({ state: LoadableState.error });
	});

	afterAll(() => output.stop());
});
