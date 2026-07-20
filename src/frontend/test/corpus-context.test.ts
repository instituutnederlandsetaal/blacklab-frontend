import { createMockBlackLabApi, createMockFrontendApi, resolvedRequest } from '@test/mocks/api';
import { describe, expect, test, vi } from 'vitest';
import { nextTick, ref, watch } from 'vue';

import { createCorpusContext } from '@/app/state/useCorpusContext';
import type { CFPageConfig, NormalizedIndex } from '@/types/apptypes';

import { CancelableRequest } from '@/shared/api/lib/api-types';

function createDeferredRequest<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>(resolvePromise => {
		resolve = resolvePromise;
	});
	return {
		request: new CancelableRequest(promise, vi.fn()),
		resolve,
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
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus: () => corpusRequest.request }), createMockFrontendApi({ getConfig: createConfig(), getTagset: undefined }), 'new-corpus', {
			beforePublish: context => {
				initializedCorpusId = context.index?.id;
				initializedCorpusIds.push(initializedCorpusId ?? '');
				interopRevision.value += 1;
			},
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
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus: createPosIndex() }), createMockFrontendApi({ getConfig: createConfig(), getTagset: undefined }), 'new-corpus', {
			beforePublish,
		});

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
		const state = createCorpusContext(createMockBlackLabApi({ getCorpus }), createMockFrontendApi({ getConfig, getTagset }), corpusId, {
			beforePublish: context => publishedIds.push(context.index!.id),
		});

		await settleReactivity();
		expect(state.corpus.value?.id).toBe('first');

		corpusId.value = 'second';
		await settleReactivity();

		expect(state.corpus.value?.id).toBe('second');
		expect(publishedIds).toEqual(['first', 'second']);
		expect(getCorpus.mock.calls.map(([id]) => id)).toEqual(['first', 'second']);
		expect(getConfig).toHaveBeenCalledTimes(2);
		expect(getTagset).toHaveBeenCalledTimes(2);
	});
});
