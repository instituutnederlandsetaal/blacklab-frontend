// @vitest-environment jsdom

import { createMockApi, rejectedRequest, resolvedRequest } from '@test/mocks/api';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope, shallowRef, type EffectScope } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { createArticleUrlBinding } from '@/pages/article/bindings/article-url-binding';
import { createArticlePageState } from '@/pages/article/model/article-page-state';
import type { Input } from '@/pages/article/model/article-resources';
import { createArticleResources } from '@/pages/article/model/article-resources';
import type { Corpus } from '@/types/apptypes';
import { type BLDocInfo, type BLHitInDoc, type BLHitResults, type BLDocument } from '@/types/blacklabtypes';

import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import { LoadableState } from '@/shared/utils/loadable/loadable-core';

const ids = {
	MOCK_DOC_ID: 'test',
};

let scope: EffectScope;
const defaultInputs = { indexId: 'test', mainField: 'contents' };
let input = shallowRef<Input>(defaultInputs);

beforeEach(() => {
	scope = effectScope();
	input = shallowRef<Input>(defaultInputs);
});

afterEach(() => {
	scope.stop();
});

const mock_hit_in_doc: BLHitInDoc = {
	after: { punct: [] },
	before: { punct: [] },
	match: { punct: [] },
};

const mock_doc_info: BLDocInfo = {
	tokenCounts: [{ fieldName: 'contents', tokens: 246 }],
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
					size: 0,
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

function hitResultsAt(...starts: number[]): BLHitResults {
	return {
		...values.MOCK_HITS,
		hits: starts.map(start => ({ ...values.MOCK_HITS.hits[0], start, end: start + 1 })),
	};
}

function createTestResources(hits: BLHitResults = values.MOCK_HITS, contents = '') {
	const { blacklabApi: blacklab, frontendApi: frontend } = createMockApi({
		blacklab: {
			getHits: hits,
			getDocumentInfo: (_indexId, docId) => (docId === values.MOCK_DOC.docPid ? resolvedRequest(values.MOCK_DOC) : rejectedRequest(values.MOCK_ERROR)),
			getSnippet: hits.hits[0] ?? values.MOCK_HITS.hits[0],
		},
		frontend: {
			getDocumentContents: contents,
			getDocumentMetadata: '<dl><dt>title</dt><dd>Test</dd></dl>',
		},
	});

	return scope.run(() => createArticleResources(blacklab, frontend, input, false))!;
}

const baseInputs: Input = {
	patt: '"test"',
	findhit: 1,
	wordstart: 0,
	wordend: 1000,
	pageSize: 10,
	docId: ids.MOCK_DOC_ID,
	...defaultInputs,
};

describe('hits', () => {
	test('navigates to a hit beyond the server window limit', async () => {
		const { blacklabApi, frontendApi } = createMockApi({
			blacklab: {
				getHits: (_indexId, params) => {
					const first = params.first ?? 0;
					return resolvedRequest({
						...values.MOCK_HITS,
						hits: values.MOCK_HITS.hits.slice(first, first + 1),
						summary: {
							...values.MOCK_HITS.summary,
							results: { ...values.MOCK_HITS.summary.results, window: { firstResult: first, requestedSize: 1, actualSize: 1, hasPrevious: first > 0, hasNext: first < 2 } },
						},
					});
				},
				getDocumentInfo: values.MOCK_DOC,
			},
			frontend: { getDocumentMetadata: '', getDocumentContents: '' },
		});
		const { hits, pagination } = scope.run(() => createArticleResources(blacklabApi, frontendApi, input, false))!;
		input.value = { ...baseInputs, findhit: 187 };
		await flushPromises();
		expect(hits.value.value).toEqual([
			[53, 54],
			[125, 126],
			[187, 188],
		]);
		expect(pagination.value.value).toMatchObject({ wordstart: 180, wordend: 190, findhit: 187 });
	});

	test.each([
		{ viewField: 'translation', field: 'translation', searchfield: 'contents' },
		{ viewField: 'contents', field: undefined, searchfield: 'translation' },
	])('uses $viewField coordinates when searching $searchfield', async ({ viewField, field, searchfield }) => {
		const parallelHits = { ...values.MOCK_HITS, hits: [{ ...values.MOCK_HITS.hits[0], start: 53, end: 54, otherFields: { [viewField]: { ...values.MOCK_HITS.hits[0], start: 7, end: 10 } } }] };
		const { blacklabApi, frontendApi } = createMockApi({
			blacklab: {
				getHits: parallelHits,
				getDocumentInfo: {
					...values.MOCK_DOC,
					docInfo: {
						...mock_doc_info,
						tokenCounts: [
							{ fieldName: searchfield, tokens: 246 },
							{ fieldName: viewField, tokens: 30 },
						],
					},
				},
			},
			frontend: { getDocumentMetadata: '', getDocumentContents: '<span class="hl" data-hit-start="7" data-hit-end="10">Target</span>' },
		});
		const { pagination, hitToHighlight } = scope.run(() => createArticleResources(blacklabApi, frontendApi, input, false))!;
		input.value = { ...baseInputs, field, searchfield, findhit: 7, pageSize: 5 };
		await flushPromises();
		expect(pagination.value.value).toMatchObject({ wordstart: 5, wordend: 10, findhit: 7, maxPage: 5 });
		const highlight = hitToHighlight.value.value;
		expect(highlight).toMatchObject({ hitIndexToHighlight: 0, isHitVisible: true });
		expect(highlight?.hl?.textContent).toBe('Target');
		expect(blacklabApi.getHits.mock.calls[0][1]).toMatchObject({ field, searchfield, patt: baseInputs.patt });
		expect(frontendApi.getDocumentContents.mock.lastCall?.[0]).toMatchObject({ field, searchfield });
	});

	test('loads document hit ranges from an empty state', async () => {
		const { hits } = createTestResources();
		expect(hits.value.state).toBe(LoadableState.empty);

		input.value = baseInputs;
		await flushPromises();

		expect(hits.value.state).toBe(LoadableState.loaded);
		expect(hits.value.value).toEqual(values.MOCK_HITS.hits.map(h => [h.start, h.end]));
	});

	test('Should clear if no docId', async () => {
		const { hits } = createTestResources();

		input.value = baseInputs;
		await flushPromises();
		input.value = { ...baseInputs, docId: undefined };
		await flushPromises();

		expect(hits.value.state).toBe(LoadableState.empty);
		expect(hits.value.value).toBeUndefined();
		expect(hits.value.error).toBeUndefined();
	});
});

describe('metadata', () => {
	test('loads document JSON and metadata HTML after receiving a document', async () => {
		const { metadata } = createTestResources();

		input.value = defaultInputs;
		await flushPromises();

		expect(metadata.value.state).toBe(LoadableState.empty);
		expect(metadata.value.value).toBeUndefined();
		expect(metadata.value.error).toBeUndefined();
		input.value = baseInputs;
		await flushPromises();

		expect(metadata.value.value).toMatchObject({
			json: values.MOCK_DOC,
			html: { innerHTML: '<dl><dt>title</dt><dd>Test</dd></dl>' },
		});
	});
});

describe('pagination', () => {
	test('waits for a document and chooses the page containing the selected hit', async () => {
		const { pagination } = createTestResources();

		input.value = defaultInputs;

		expect(pagination.value.state).toBe(LoadableState.empty);
		expect(pagination.value.value).toBeUndefined();
		expect(pagination.value.error).toBeUndefined();
		input.value = {
			...baseInputs,
			findhit: values.MOCK_HITS.hits[0].start,
			pageSize: 10,
			wordstart: 0,
			wordend: 1000,
		};
		await flushPromises();
		expect(pagination.value.value).toMatchObject({
			wordstart: 50,
			wordend: 60,
		});

		input.value = {
			...baseInputs,
			findhit: values.MOCK_HITS.hits[0].start,
			pageSize: 100,
			wordstart: 0,
			wordend: 1000,
		};
		await flushPromises();
		expect(pagination.value.value).toMatchObject({
			wordstart: 0,
			wordend: 100,
			findhit: values.MOCK_HITS.hits[0].start,
		});
	});

	test.each([0, 54, 10000])('Should clear a non-hit findhit at %s', async findhit => {
		const { pagination } = createTestResources();

		input.value = { ...baseInputs, findhit };
		await flushPromises();

		expect(pagination.value.value).toMatchObject({ findhit: undefined });
	});

	test('Should disable pagination if the pageSize is not provided', async () => {
		const { pagination } = createTestResources();

		input.value = {
			...baseInputs,
			pageSize: undefined,
		};
		await flushPromises();

		expect(pagination.value.value).toMatchObject({
			pageSize: null,
			wordstart: 0,
			wordend: values.MOCK_DOC.docInfo.tokenCounts[0].tokens,
			page: 0,
			maxPage: 0,
		});
	});

	test('Should not add a phantom page when the document length is an exact multiple of pageSize', async () => {
		const { pagination } = createTestResources();

		input.value = {
			...baseInputs,
			findhit: undefined,
			pageSize: 123,
			wordstart: 0,
			wordend: 123,
		};
		await flushPromises();

		expect(pagination.value.value).toMatchObject({
			page: 0,
			maxPage: 1,
		});
	});

	test('Should expose the error as a Loadable if the doc is not found', async () => {
		const { pagination } = createTestResources();

		input.value = {
			...baseInputs,
			docId: 'notfound',
		};

		await flushPromises();
		expect(pagination.value.error).toBeInstanceOf(ApiError);
		expect(pagination.value).toMatchObject({ state: LoadableState.error });
	});
});

describe('hitToHighlight', () => {
	test('finds generated BlackLab highlights when preceding hits are split across XML tags', async () => {
		const { hitToHighlight } = createTestResources(
			values.MOCK_HITS,
			'<span class="hl" start="53" end="54">First piece</span><span class="hl" start="53" end="54">Second piece</span><span class="hl" start="125" end="126">Selected hit</span>',
		);
		input.value = { ...baseInputs, findhit: 125, pageSize: 246 };
		await flushPromises();
		const highlight = hitToHighlight.value.value;
		expect(highlight?.hl?.textContent).toBe('Selected hit');
	});

	test.each([
		['before the first hit', 0, 0],
		['at an exact hit', 125, 1],
		['between hits', 126, 2],
		['after the final hit', 230, 2],
	] as const)('Should use the expected inactive navigation target %s', async (_description, wordstart, expectedIndex) => {
		const { hitToHighlight } = createTestResources();

		input.value = {
			...baseInputs,
			findhit: undefined,
			pageSize: 10,
			wordstart,
			wordend: wordstart + 10,
		};
		await flushPromises();

		expect(hitToHighlight.value.value).toMatchObject({
			totalHits: values.MOCK_HITS.hits.length,
			hitIndexToHighlight: expectedIndex,
			isHitVisible: false,
		});
	});

	test('selects a visible matching hit when multiple hits share a start', async () => {
		const duplicateHits = hitResultsAt(53, 53, 125);
		const { hitToHighlight } = createTestResources(duplicateHits, '<span class="hl">first</span><span class="hl">second</span>');

		input.value = { ...baseInputs, findhit: 53 };
		await flushPromises();

		expect(hitToHighlight.value.value).toMatchObject({ totalHits: 3, isHitVisible: true });
		expect(duplicateHits.hits[hitToHighlight.value.value!.hitIndexToHighlight].start).toBe(53);
		expect(hitToHighlight.value.value!.hl?.textContent).toBe(['first', 'second'][hitToHighlight.value.value!.hitIndexToHighlight]);
	});

	test('Should handle an empty hit list', async () => {
		const { hitToHighlight } = createTestResources(hitResultsAt());

		input.value = { ...baseInputs, findhit: undefined };
		await flushPromises();

		expect(hitToHighlight.value.value).toMatchObject({ totalHits: 0, hitIndexToHighlight: 0, isHitVisible: false });
	});
});

test('changing pagination reuses metadata and hits and requests just the displayed contents', async () => {
	const { blacklabApi, frontendApi } = createMockApi({
		blacklab: { getHits: values.MOCK_HITS, getDocumentInfo: values.MOCK_DOC },
		frontend: { getDocumentContents: '', getDocumentMetadata: '' },
	});
	scope.run(() => createArticleResources(blacklabApi, frontendApi, input, false));
	input.value = { ...baseInputs, pageSize: null, wordstart: 10, wordend: 20 };
	await flushPromises();
	expect(frontendApi.getDocumentContents.mock.lastCall?.[0]).toMatchObject({ wordstart: undefined, wordend: undefined });

	input.value = { ...input.value, pageSize: 10 };
	await flushPromises();
	expect(frontendApi.getDocumentContents.mock.lastCall?.[0]).toMatchObject({ wordstart: 10, wordend: 20 });
	expect(blacklabApi.getDocumentInfo).toHaveBeenCalledOnce();
	expect(blacklabApi.getHits).toHaveBeenCalledOnce();
});

test('requests a document only for the corpus that owns its article route', async () => {
	const corpus = { id: 'test', mainAnnotatedField: 'contents', allAnnotatedFieldsMap: { contents: { id: 'contents' }, translation: { id: 'translation' } } } as unknown as Corpus;
	const secondCorpus = { ...corpus, id: 'second' };
	const loadedCorpus = shallowRef(corpus);
	const router = createRouter({ history: createMemoryHistory(), routes: [{ name: 'article', path: '/:corpus/docs/:docId', component: {} }] });
	await router.push('/test/docs/old');
	const state = createArticlePageState();
	const binding = createArticleUrlBinding(router, state, loadedCorpus);
	const { blacklabApi, frontendApi } = createMockApi({ blacklab: { getDocumentInfo: values.MOCK_DOC }, frontend: { getDocumentMetadata: '', getDocumentContents: '' } });
	try {
		scope.run(() => createArticleResources(blacklabApi, frontendApi, () => ({ ...state.query.value, mainField: loadedCorpus.value.mainAnnotatedField }), false));
		await router.push('/second/docs/new');
		await flushPromises();
		expect(blacklabApi.getDocumentInfo.mock.calls).toEqual([['test', 'old']]);

		loadedCorpus.value = secondCorpus;
		await flushPromises();
		expect(blacklabApi.getDocumentInfo.mock.calls).toEqual([
			['test', 'old'],
			['second', 'new'],
		]);
	} finally {
		binding.stop();
	}
});

test.each([
	{ indexId: 'test', docId: 'new' },
	{ indexId: 'second', docId: ids.MOCK_DOC_ID },
])('navigating to $indexId/$docId waits for its length and ignores late markup', async nextDoc => {
	const oldMarkup = Promise.withResolvers<string>();
	const newMetadata = Promise.withResolvers<BLDocument>();
	const cancel = vi.fn();
	const { blacklabApi, frontendApi } = createMockApi({
		blacklab: {
			getDocumentInfo: (indexId, docId) => (indexId === nextDoc.indexId && docId === nextDoc.docId ? new CancelableRequest(newMetadata.promise, vi.fn()) : resolvedRequest(values.MOCK_DOC)),
		},
		frontend: {
			getDocumentMetadata: '',
			getDocumentContents: ({ indexId, docId }) => (indexId === nextDoc.indexId && docId === nextDoc.docId ? resolvedRequest('current') : new CancelableRequest(oldMarkup.promise, cancel)),
		},
	});
	const { contents, pagination } = scope.run(() => createArticleResources(blacklabApi, frontendApi, input, false))!;
	input.value = { ...baseInputs, patt: null, wordstart: 100, wordend: 110 };
	await flushPromises();
	expect(pagination.value.value?.wordstart).toBe(100);
	input.value = { ...input.value, ...nextDoc };
	expect(pagination.value.isLoading()).toBe(true);
	await flushPromises();
	expect(cancel).toHaveBeenCalledOnce();
	expect(frontendApi.getDocumentContents).toHaveBeenCalledTimes(1);

	newMetadata.resolve({ ...values.MOCK_DOC, docPid: nextDoc.docId, docInfo: { ...mock_doc_info, tokenCounts: [{ fieldName: 'contents', tokens: 4 }] } });
	await flushPromises();
	expect(frontendApi.getDocumentContents.mock.lastCall?.[0]).toMatchObject({ ...nextDoc, wordstart: 0, wordend: 4 });
	oldMarkup.resolve('obsolete');
	await flushPromises();
	expect(contents.value.value?.html.textContent).toBe('current');
});
