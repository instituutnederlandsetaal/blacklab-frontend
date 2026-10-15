import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { BLIndexMetadata, BLIndexMetadataV4 } from '@/types/blacklabtypes';

import { createMockHttp } from './mocks/http';

import { createBlackLabApi } from '@/shared/api/blacklabApi';
import { ApiError } from '@/shared/api/lib/api-types';

const relations = {
	spans: { s: { count: 12, attributes: { type: { values: { sentence: 12 }, valueListComplete: true } } } },
	relations: { dependency: { subject: 8 } },
};

function v4Metadata(withValues = false): BLIndexMetadataV4 {
	const annotation = { hasForwardIndex: true, isInternal: false, offsetsAlternative: 's', sensitivity: 'SENSITIVE_AND_INSENSITIVE' as const };
	return {
		indexName: 'owner:corpus',
		displayName: 'Example corpus',
		contentViewable: true,
		status: 'available',
		textDirection: 'ltr',
		tokenCount: 120,
		documentCount: 3,
		versionInfo: { blacklabBuildTime: '', blacklabScmRevision: 'test', blacklabVersion: '4.2.0', indexFormat: '4', timeCreated: '', timeModified: '2026-10-14' },
		mainAnnotatedField: 'contents',
		annotatedFields: {
			contents: {
				fieldName: 'contents',
				hasContentStore: true,
				isAnnotatedField: true,
				mainAnnotation: 'word',
				hasXmlTags: true,
				annotations: {
					word: { ...annotation, displayName: 'Word', valueListComplete: withValues, values: withValues ? ['water', 'ship'] : undefined },
					punct: { ...annotation, hasForwardIndex: false, isInternal: true },
					lemma: { ...annotation, displayName: 'Lemma', valueListComplete: withValues, values: withValues ? ['water', 'ship'] : undefined },
				},
			},
		},
		annotationGroups: { contents: [{ name: 'Words', annotations: ['word', 'lemma'] }] },
		metadataFields: {},
		metadataFieldGroups: [],
		fieldInfo: {},
	};
}

function v5Metadata(): BLIndexMetadata {
	return {
		corpusName: 'owner:corpus',
		contentViewable: true,
		status: 'available',
		count: { documents: 3, tokens: 120 },
		versionInfo: { blacklabBuildTime: '', blacklabScmRevision: 'test', blacklabVersion: '4.4.0-SNAPSHOT', indexFormat: '5', timeCreated: '', timeModified: '2026-10-14' },
		custom: { displayName: 'Example corpus', textDirection: 'ltr', annotationGroups: {}, metadataFieldGroups: [] },
		mainAnnotatedField: 'contents',
		annotatedFields: {
			contents: {
				fieldName: 'contents',
				hasContentStore: true,
				isAnnotatedField: true,
				mainAnnotation: 'word',
				hasXmlTags: true,
				count: { documents: 3, tokens: 120 },
				annotations: {
					word: {
						hasForwardIndex: true,
						isInternal: false,
						offsetsAlternative: 's',
						sensitivity: 'SENSITIVE_AND_INSENSITIVE',
						custom: { displayName: 'Word' },
						terms: { water: 80, ship: 40 },
						valueListComplete: true,
					},
				},
				relations,
			},
		},
		metadataFields: {},
		pidField: 'pid',
	};
}

async function createApi(blacklabVersion: string) {
	const http = createMockHttp();
	const api = await createBlackLabApi({ baseUrl: '/blacklab', user: null, blacklabVersion, axiosOptions: { adapter: http.adapter } });
	return { api, http };
}

beforeEach(() => vi.stubGlobal('WITH_CREDENTIALS', false));
afterEach(() => vi.unstubAllGlobals());

describe('BlackLab corpus request cancellation', () => {
	test('starts V4 relations concurrently and cancels stage one and relations before transition', async () => {
		const { api, http } = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus');
		const stageOne = await http.nextRequest();
		const relationRequest = await http.nextRequest();
		expect(http.requests.map(sent => sent.config.url)).toEqual(['owner:corpus/', 'owner:corpus/relations/']);
		request.cancel();
		await expect(request).rejects.toBe(ApiError.CANCELLED);
		expect(stageOne.cancelled).toBe(true);
		expect(relationRequest.cancelled).toBe(true);
	});

	test('cancels V4 stage two and relations after the metadata transition', async () => {
		const { api, http } = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus');
		const publication = vi.fn();
		const observed = request.then(publication);
		const stageOne = await http.nextRequest();
		const relationRequest = await http.nextRequest();
		stageOne.respond(v4Metadata());
		const stageTwo = await http.nextRequest();
		expect(stageTwo.config.url).toBe('owner:corpus/');
		expect(stageTwo.query.get('listvalues')).toBe('word,lemma');
		request.cancel();
		await expect(observed).rejects.toBe(ApiError.CANCELLED);
		expect(stageTwo.cancelled).toBe(true);
		expect(relationRequest.cancelled).toBe(true);
		stageTwo.respond(v4Metadata(true));
		relationRequest.respond(relations);
		expect(publication).not.toHaveBeenCalled();
	});

	test('regression: cancellation after Axios receives V4 metadata prevents stage two', async () => {
		const { api, http } = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus', {
			transformResponse: data => {
				// Cancel after Axios accepts the response, before the API starts loading annotation values.
				request.cancel();
				return data;
			},
		});
		const publication = vi.fn();
		const observed = request.then(publication);
		const stageOne = await http.nextRequest();
		const relationRequest = await http.nextRequest();
		stageOne.respond(v4Metadata());
		await expect(observed).rejects.toBe(ApiError.CANCELLED);
		expect(http.requests).toHaveLength(2);
		expect(stageOne.cancelled).toBe(true);
		expect(relationRequest.cancelled).toBe(true);
		expect(publication).not.toHaveBeenCalled();
	});

	test('normalizes V4 stage-two metadata with its concurrent relations', async () => {
		const { api, http } = await createApi('4.2.0');
		const request = api.getCorpus('owner:corpus');
		const stageOne = await http.nextRequest();
		const relationRequest = await http.nextRequest();
		stageOne.respond(v4Metadata());
		const stageTwo = await http.nextRequest();
		stageTwo.respond(v4Metadata(true));
		relationRequest.respond(relations);
		const corpus = await request;
		expect(http.requests).toHaveLength(3);
		expect(corpus).toMatchObject({ id: 'owner:corpus', owner: 'owner', displayName: 'Example corpus', tokenCount: 120, documentCount: 3, runtimeVersion: '4.2.0', relations });
		expect(corpus.annotatedFields.contents.annotations.word).toMatchObject({
			id: 'word',
			defaultDisplayName: 'Word',
			isMainAnnotation: true,
			uiType: 'select',
			values: [
				{ value: 'water', label: 'water', title: null },
				{ value: 'ship', label: 'ship', title: null },
			],
		});
	});

	test('keeps V5 to one metadata request and uses its inline relations', async () => {
		const { api, http } = await createApi('5.0.0-SNAPSHOT');
		const request = api.getCorpus('owner:corpus');
		const metadataRequest = await http.nextRequest();
		expect(metadataRequest.config.url).toBe('corpora/owner:corpus/');
		expect(Object.fromEntries(metadataRequest.query)).toEqual({ api: '5', custom: 'true', listvalues: '*' });
		metadataRequest.respond(v5Metadata());
		const corpus = await request;
		expect(http.requests).toHaveLength(1);
		expect(corpus).toMatchObject({ id: 'owner:corpus', displayName: 'Example corpus', tokenCount: 120, documentCount: 3, indexerVersion: '4.4.0', runtimeVersion: '5.0.0', relations });
		expect(corpus.annotatedFields.contents.annotations.word).toMatchObject({
			defaultDisplayName: 'Word',
			isMainAnnotation: true,
			uiType: 'select',
			values: [
				{ value: 'water', label: 'water', title: null },
				{ value: 'ship', label: 'ship', title: null },
			],
		});
	});
});
