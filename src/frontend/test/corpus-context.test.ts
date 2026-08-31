import { createMockBlackLabApi, createMockFrontendApi, resolvedRequest } from '@test/mocks/api';
import { describe, expect, test, vi } from 'vitest';
import { nextTick, ref, watch } from 'vue';

import { createCorpusContext } from '@/app/state/useCorpusContext';
import type { CFPageConfig, NormalizedIndex } from '@/types/apptypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';
import { LoadableState } from '@/shared/utils/loadable/loadable-core';

function createDeferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const cancel = vi.fn();
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return {
		request: new CancelableRequest(promise, cancel),
		resolve,
		reject,
		cancel,
	};
}

async function settleReactivity() {
	for (let i = 0; i < 4; i += 1) {
		await Promise.resolve();
		await nextTick();
	}
}

function createIndex(id = 'new-corpus'): NormalizedIndex {
	const word = {
		custom: { displayName: 'Word' },
		displayName: 'Word',
		description: '',
		hasForwardIndex: true,
		isInternal: false,
		offsetsAlternative: '',
		sensitivity: 'sensitive_insensitive',
		uiType: 'text',
	};

	return {
		annotatedFields: {
			contents: {
				annotations: { word },
				defaultDescription: '',
				defaultDisplayName: 'Contents',
				hasContentStore: true,
				hasLengthTokens: true,
				hasXmlTags: true,
				id: 'contents',
				isAnnotatedField: true,
				isParallel: false,
				mainAnnotationId: 'word',
			},
		},
		annotationGroups: [{ annotatedFieldId: 'contents', entries: ['word'], id: 'Contents', isRemainderGroup: false }],
		contentViewable: true,
		description: '',
		displayName: 'New corpus',
		documentCount: 1,
		fieldInfo: {},
		id,
		indexProgress: null,
		mainAnnotatedField: 'contents',
		metadataFieldGroups: [],
		metadataFields: {},
		owner: null,
		relations: { relations: {}, spans: {} },
		status: 'available',
		textDirection: 'ltr',
		timeModified: '',
		tokenCount: 1,
	} as unknown as NormalizedIndex;
}

function createConfig(): CFPageConfig {
	return {
		analytics: { google: null, plausible: null },
		bannerMessage: null,
		customCss: {},
		customJs: {},
		displayName: 'New configuration',
		faviconDir: '',
		footerMessage: null,
		navbarLinks: [],
		pageSize: null,
	};
}

function createPosIndex(): NormalizedIndex {
	const index = createIndex();
	index.annotatedFields.contents.annotations = {
		pos: {
			annotatedFieldId: 'contents',
			caseSensitive: false,
			defaultDescription: '',
			defaultDisplayName: 'Part of speech',
			hasForwardIndex: true,
			id: 'pos',
			isInternal: false,
			isMainAnnotation: true,
			offsetsAlternative: '',
			subAnnotations: ['number'],
			uiType: 'pos',
			values: [{ value: 'NOU', label: 'Noun', title: null }],
		},
		number: {
			annotatedFieldId: 'contents',
			caseSensitive: false,
			defaultDescription: '',
			defaultDisplayName: 'Number',
			hasForwardIndex: true,
			id: 'number',
			isInternal: false,
			isMainAnnotation: false,
			offsetsAlternative: '',
			parentAnnotationId: 'pos',
			uiType: 'select',
			values: [{ value: 'SG', label: 'Singular', title: null }],
		},
	} as NormalizedIndex['annotatedFields'][string]['annotations'];
	index.annotatedFields.contents.mainAnnotationId = 'pos';
	index.annotationGroups = [{ annotatedFieldId: 'contents', entries: ['pos', 'number'], id: 'Contents', isRemainderGroup: false }];
	return index;
}

describe('corpus context publication', () => {
	test('publishes one coherent generation after its initialization checkpoint', async () => {
		const corpusRequest = createDeferredRequest<NormalizedIndex>();
		const initializedCorpusIds: string[] = [];
		let initializedCorpusId: string | undefined;
		const interopRevision = ref(0);
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus: () => corpusRequest.request }), createMockFrontendApi({ getConfig: createConfig(), getTagset: undefined }), 'new-corpus');
		state.beforePublish(context => {
			initializedCorpusId = context.index?.id;
			initializedCorpusIds.push(initializedCorpusId ?? '');
			interopRevision.value += 1;
		});
		const observations: Array<{ contextId: string; initializedCorpusId: string | undefined }> = [];
		watch(
			state.corpus,
			corpus => {
				if (corpus) observations.push({ contextId: corpus.id, initializedCorpusId });
			},
			{ flush: 'sync' },
		);

		await settleReactivity();

		// Config has returned, but no public leaf exposes the new generation until
		// the entire context can pass through the checkpoint.
		expect(state.contextLoader.isLoaded()).toBe(false);
		expect(state.config.value.displayName).toBeNull();
		expect(state.corpus.value).toBeUndefined();
		expect(initializedCorpusIds).toEqual([]);

		corpusRequest.resolve(createIndex());
		await settleReactivity();

		expect(state.contextLoader.isLoaded()).toBe(true);
		expect(state.config.value.displayName).toBe('New configuration');
		expect(initializedCorpusIds).toEqual(['new-corpus']);
		expect(observations).toEqual([{ contextId: 'new-corpus', initializedCorpusId: 'new-corpus' }]);

		// Reading reactive legacy state in the checkpoint must not make later legacy
		// changes re-run corpus initialization.
		interopRevision.value += 1;
		await settleReactivity();
		expect(initializedCorpusIds).toEqual(['new-corpus']);
	});

	test('normalizes POS data exactly once before publishing the context', async () => {
		const beforePublish = vi.fn();
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus: createPosIndex() }), createMockFrontendApi({ getConfig: createConfig(), getTagset: undefined }), 'new-corpus');
		state.beforePublish(beforePublish);

		await settleReactivity();
		await settleReactivity();

		expect(state.contextLoader.isLoaded()).toBe(true);
		expect(beforePublish).toHaveBeenCalledTimes(1);
		expect(state.tagset.value?.values).toEqual({ NOU: { value: 'nou', displayName: 'Noun', subAnnotationIds: ['number'] } });
		expect(state.corpus.value?.annotatedFields.contents.annotations.pos.values).toEqual([{ value: 'nou', label: 'Noun', title: null }]);
	});

	test('publishes distinct corpus-id generations through stable request loadables', async () => {
		const corpusId = ref('first');
		const publishedIds: string[] = [];
		const getCorpus = vi.fn((id: string) => resolvedRequest(createIndex(id)));
		const getConfig = vi.fn(() => resolvedRequest(createConfig()));
		const getTagset = vi.fn(() => resolvedRequest(undefined));
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus }), createMockFrontendApi({ getConfig, getTagset }), corpusId);
		state.beforePublish(context => publishedIds.push(context.index!.id));

		await settleReactivity();
		expect(state.corpus.value?.id).toBe('first');

		corpusId.value = 'second';
		await settleReactivity();

		expect(state.corpus.value?.id).toBe('second');
		expect(publishedIds).toEqual(['first', 'second']);
		expect(getCorpus.mock.calls.map(([id]) => id)).toEqual(['first', 'second']);
		expect(getConfig).toHaveBeenCalledTimes(2);
		expect(getConfig.mock.calls).toEqual([
			['first', { headers: { 'Cache-Control': 'no-cache' } }],
			['second', { headers: { 'Cache-Control': 'no-cache' } }],
		]);
		expect(getTagset).toHaveBeenCalledTimes(2);
	});

	test('uses global configuration without corpus requests for a null corpus id', async () => {
		const corpusId = ref<string | null>(null);
		const publishedIds: Array<string | undefined> = [];
		const getCorpus = vi.fn((id: string) => resolvedRequest(createIndex(id)));
		const getConfig = vi.fn(() => resolvedRequest(createConfig()));
		const getTagset = vi.fn(() => resolvedRequest(undefined));
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus }), createMockFrontendApi({ getConfig, getTagset }), corpusId);
		state.beforePublish(context => publishedIds.push(context.index?.id));

		await settleReactivity();
		expect(state.contextLoader.isLoaded()).toBe(true);
		expect(state.contextLoader.value?.index).toBeUndefined();
		expect(state.config.value.displayName).toBe('New configuration');
		expect(getCorpus).not.toHaveBeenCalled();
		expect(getTagset).not.toHaveBeenCalled();
		expect(getConfig).toHaveBeenCalledWith(null, { headers: { 'Cache-Control': 'no-cache' } });
		expect(publishedIds).toEqual([undefined]);

		corpusId.value = 'first';
		await settleReactivity();
		expect(state.corpus.value?.id).toBe('first');
		expect(publishedIds).toEqual([undefined, 'first']);
	});

	test('retry creates fresh transports after failed and fulfilled same-id generations', async () => {
		const corpusRequests = [createDeferredRequest<NormalizedIndex>(), createDeferredRequest<NormalizedIndex>(), createDeferredRequest<NormalizedIndex>()];
		const configRequests = [createDeferredRequest<CFPageConfig>(), createDeferredRequest<CFPageConfig>(), createDeferredRequest<CFPageConfig>()];
		const tagsetRequests = [createDeferredRequest<undefined>(), createDeferredRequest<undefined>(), createDeferredRequest<undefined>()];
		let corpusAttempt = 0;
		let configAttempt = 0;
		let tagsetAttempt = 0;
		const getCorpus = vi.fn(() => corpusRequests[corpusAttempt++].request);
		const getConfig = vi.fn(() => configRequests[configAttempt++].request);
		const getTagset = vi.fn(() => tagsetRequests[tagsetAttempt++].request);
		const publications = vi.fn();
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus }), createMockFrontendApi({ getConfig, getTagset }), 'same-id');
		state.beforePublish(publications);

		expect(state.contextLoader.state).toBe(LoadableState.loading);
		corpusRequests[0].reject(new Error('first attempt failed'));
		configRequests[0].resolve(createConfig());
		tagsetRequests[0].resolve(undefined);
		await settleReactivity();
		expect(state.contextLoader.isError()).toBe(true);
		expect(publications).not.toHaveBeenCalled();

		state.contextLoader.retry();
		await nextTick();
		expect(state.contextLoader.state).toBe(LoadableState.loading);
		expect([getCorpus, getConfig, getTagset].map(fn => fn.mock.calls.length)).toEqual([2, 2, 2]);
		corpusRequests[1].resolve(createIndex('same-id'));
		configRequests[1].resolve(createConfig());
		tagsetRequests[1].resolve(undefined);
		await settleReactivity();
		expect(state.contextLoader.isLoaded()).toBe(true);
		expect(publications).toHaveBeenCalledTimes(1);

		state.contextLoader.retry();
		await nextTick();
		expect(state.contextLoader.state).toBe(LoadableState.loading);
		expect([getCorpus, getConfig, getTagset].map(fn => fn.mock.calls.length)).toEqual([3, 3, 3]);
		corpusRequests[2].resolve(createIndex('same-id'));
		configRequests[2].resolve(createConfig());
		tagsetRequests[2].resolve(undefined);
		await settleReactivity();
		expect(publications).toHaveBeenCalledTimes(2);

		for (const requests of [corpusRequests, configRequests, tagsetRequests]) expect(requests.map(request => request.cancel.mock.calls.length)).toEqual([0, 0, 0]);
	});

	test('owns A to B to A requests by generation and ignores all late results', async () => {
		const corpusId = ref('alpha');
		const firstAlpha = {
			corpus: createDeferredRequest<NormalizedIndex>(),
			config: createDeferredRequest<CFPageConfig>(),
			tagset: createDeferredRequest<undefined>(),
		};
		const beta = {
			corpus: createDeferredRequest<NormalizedIndex>(),
			config: createDeferredRequest<CFPageConfig>(),
			tagset: createDeferredRequest<undefined>(),
		};
		const secondAlpha = {
			corpus: createDeferredRequest<NormalizedIndex>(),
			config: createDeferredRequest<CFPageConfig>(),
			tagset: createDeferredRequest<undefined>(),
		};
		const generations = [firstAlpha, beta, secondAlpha];
		let corpusAttempt = 0;
		let configAttempt = 0;
		let tagsetAttempt = 0;
		const state = createCorpusContext(
			createMockBlackLabApi({ getCorpus: () => generations[corpusAttempt++].corpus.request }),
			createMockFrontendApi({
				getConfig: () => generations[configAttempt++].config.request,
				getTagset: () => generations[tagsetAttempt++].tagset.request,
			}),
			corpusId,
		);
		const publishedIds: string[] = [];
		state.beforePublish(context => publishedIds.push(context.index!.id));

		corpusId.value = 'beta';
		await nextTick();
		expect([firstAlpha.corpus, firstAlpha.config, firstAlpha.tagset].map(request => request.cancel.mock.calls.length)).toEqual([1, 1, 1]);
		corpusId.value = 'alpha';
		await nextTick();
		expect([beta.corpus, beta.config, beta.tagset].map(request => request.cancel.mock.calls.length)).toEqual([1, 1, 1]);
		expect(state.contextLoader.state).toBe(LoadableState.loading);

		firstAlpha.corpus.resolve(createIndex('alpha'));
		firstAlpha.config.resolve(createConfig());
		firstAlpha.tagset.resolve(undefined);
		beta.corpus.resolve(createIndex('beta'));
		beta.config.resolve(createConfig());
		beta.tagset.resolve(undefined);
		await settleReactivity();
		expect(publishedIds).toEqual([]);

		secondAlpha.corpus.resolve(createIndex('alpha'));
		secondAlpha.config.resolve(createConfig());
		secondAlpha.tagset.resolve(undefined);
		await settleReactivity();
		expect(state.corpus.value?.id).toBe('alpha');
		expect(publishedIds).toEqual(['alpha']);
	});
});
