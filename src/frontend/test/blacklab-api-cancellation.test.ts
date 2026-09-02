import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { BLIndexMetadata, BLIndexMetadataV4, BLRelationInfo } from '@/types/blacklabtypes';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError, CancelableRequest } from '@/shared/api/lib/api-types';
import type * as NormalizeCorpusModule from '@/shared/blacklab-helpers/normalize/normalize-corpus';

const mock = vi.hoisted(() => ({
	getCancelable: vi.fn(),
	normalizeIndex: vi.fn(),
}));

vi.mock('@/shared/api/lib/api-endpoint', () => ({ createEndpoint: () => ({ getCancelable: mock.getCancelable }) }));
vi.mock('@/shared/blacklab-helpers/normalize/normalize-corpus', async importOriginal => ({
	...(await importOriginal<typeof NormalizeCorpusModule>()),
	normalizeIndex: mock.normalizeIndex,
}));

function deferredRequest<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const cancel = vi.fn(() => reject(ApiError.CANCELLED));
	return {
		request: new CancelableRequest(
			new Promise<T>((resolvePromise, rejectPromise) => {
				resolve = resolvePromise;
				reject = rejectPromise;
			}),
			cancel,
		),
		resolve,
		cancel,
	};
}

function v4StageOne(): BLIndexMetadataV4 {
	return {
		mainAnnotatedField: 'contents',
		annotatedFields: {
			contents: {
				annotations: {
					word: { hasForwardIndex: true },
					punct: { hasForwardIndex: false },
					lemma: { hasForwardIndex: true },
				},
			},
		},
	} as unknown as BLIndexMetadataV4;
}

async function createApi(version: '4.2.0' | '5.0.0' | '5.0.0-SNAPSHOT') {
	return createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion: version });
}

beforeEach(() => {
	mock.getCancelable.mockReset();
	mock.normalizeIndex.mockReset();
});

describe('BlackLab corpus request cancellation', () => {
	test('starts V4 relations concurrently and cancels stage one and relations before transition', async () => {
		const stageOne = deferredRequest<BLIndexMetadataV4>();
		const relations = deferredRequest<BLRelationInfo>();
		mock.getCancelable.mockReturnValueOnce(stageOne.request).mockReturnValueOnce(relations.request);
		const api = await createApi('4.2.0');

		const request = api.getCorpus('owner:corpus');
		expect(mock.getCancelable.mock.calls.map(([url]) => url)).toEqual(['owner:corpus/', 'owner:corpus/relations/']);

		request.cancel();
		await expect(request).rejects.toBe(ApiError.CANCELLED);
		expect(stageOne.cancel).toHaveBeenCalledOnce();
		expect(relations.cancel).toHaveBeenCalledOnce();
	});

	test('cancels V4 stage two and relations after the metadata transition', async () => {
		const stageOne = deferredRequest<BLIndexMetadataV4>();
		const relations = deferredRequest<BLRelationInfo>();
		const stageTwo = deferredRequest<BLIndexMetadataV4>();
		mock.getCancelable.mockReturnValueOnce(stageOne.request).mockReturnValueOnce(relations.request).mockReturnValueOnce(stageTwo.request);
		const api = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus');
		const publication = vi.fn();
		const observed = request.then(publication);

		stageOne.resolve(v4StageOne());
		await Promise.resolve();
		expect(mock.getCancelable).toHaveBeenNthCalledWith(3, 'owner:corpus/', { listvalues: 'word,lemma' }, undefined);

		request.cancel();
		await expect(observed).rejects.toBe(ApiError.CANCELLED);
		expect(stageOne.cancel).not.toHaveBeenCalled();
		expect(stageTwo.cancel).toHaveBeenCalledOnce();
		expect(relations.cancel).toHaveBeenCalledOnce();
		stageTwo.resolve({} as BLIndexMetadataV4);
		relations.resolve({} as BLRelationInfo);
		await Promise.resolve();
		expect(publication).not.toHaveBeenCalled();
		expect(mock.normalizeIndex).not.toHaveBeenCalled();
	});

	test('does not start V4 stage two when cancelled before the transition microtask', async () => {
		const stageOne = deferredRequest<BLIndexMetadataV4>();
		const relations = deferredRequest<BLRelationInfo>();
		mock.getCancelable.mockReturnValueOnce(stageOne.request).mockReturnValueOnce(relations.request);
		const api = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus');
		const publication = vi.fn();
		const observed = request.then(publication);

		stageOne.resolve(v4StageOne());
		request.cancel();

		await expect(observed).rejects.toBe(ApiError.CANCELLED);
		expect(mock.getCancelable).toHaveBeenCalledTimes(2);
		expect(stageOne.cancel).toHaveBeenCalledOnce();
		expect(relations.cancel).toHaveBeenCalledOnce();
		expect(publication).not.toHaveBeenCalled();
		expect(mock.normalizeIndex).not.toHaveBeenCalled();
	});

	test('normalizes V4 stage-two metadata with its concurrent relations', async () => {
		const stageOne = deferredRequest<BLIndexMetadataV4>();
		const relations = deferredRequest<BLRelationInfo>();
		const stageTwo = deferredRequest<BLIndexMetadataV4>();
		const normalized = { id: 'owner:corpus' };
		const metadata = {} as BLIndexMetadataV4;
		const relationInfo = {} as BLRelationInfo;
		mock.getCancelable.mockReturnValueOnce(stageOne.request).mockReturnValueOnce(relations.request).mockReturnValueOnce(stageTwo.request);
		mock.normalizeIndex.mockReturnValue(normalized);
		const api = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus');

		stageOne.resolve(v4StageOne());
		await Promise.resolve();
		stageTwo.resolve(metadata);
		relations.resolve(relationInfo);

		await expect(request).resolves.toBe(normalized);
		expect(mock.normalizeIndex).toHaveBeenCalledWith(metadata, relationInfo, '4.2.0');
	});

	test('keeps V5 to one metadata request and uses its inline relations', async () => {
		const metadataRequest = deferredRequest<BLIndexMetadata>();
		const inlineRelations = {} as BLRelationInfo;
		const metadata = {
			mainAnnotatedField: 'contents',
			annotatedFields: { contents: { relations: inlineRelations } },
		} as unknown as BLIndexMetadata;
		const normalized = { id: 'owner:corpus' };
		mock.getCancelable.mockReturnValue(metadataRequest.request);
		mock.normalizeIndex.mockReturnValue(normalized);
		const api = await createApi('5.0.0-SNAPSHOT');

		const request = api.getCorpus('owner:corpus');
		expect(mock.getCancelable).toHaveBeenCalledOnce();
		expect(mock.getCancelable).toHaveBeenCalledWith('corpora/owner:corpus/', { custom: true, listvalues: '*' }, undefined);
		metadataRequest.resolve(metadata);

		await expect(request).resolves.toBe(normalized);
		expect(mock.normalizeIndex).toHaveBeenCalledWith(metadata, inlineRelations, '5.0.0');
	});
});
