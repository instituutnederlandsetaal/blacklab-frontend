import { expect, test } from 'vitest';

import { type BLIndex, type BLIndexV4, normalizeBlackLabVersion } from '@/types/blacklabtypes';

import { normalizeIndex, normalizeIndexBase, normalizeServerInfo } from '@/shared/blacklab-helpers/normalize/normalize-corpus';

test('uses version-specific counts while preserving the V5-only docVersions property', () => {
	const v4: BLIndexV4 = {
		status: 'indexing',
		timeModified: '',
		indexProgress: undefined,
		tokenCount: 41,
		documentCount: 17,
	};
	const v5: BLIndex = {
		status: 'indexing',
		timeModified: '',
		indexProgress: undefined,
		count: {
			tokens: 83,
			documents: 29,
			docVersions: undefined,
		},
	};

	const normalizedV4 = normalizeIndexBase(v4, 'owner:v4');
	const normalizedV5 = normalizeIndexBase(v5, 'owner:v5');

	expect(normalizedV4).toMatchObject({ tokenCount: 41, documentCount: 17, indexProgress: null });
	expect(normalizedV5).toMatchObject({ tokenCount: 83, documentCount: 29, indexProgress: null });
	expect(Object.hasOwn(normalizedV4, 'docVersions')).toBe(false);
	expect(Object.hasOwn(normalizedV5, 'docVersions')).toBe(true);
	expect(normalizedV5.docVersions).toBeUndefined();
});

test.each([
	['5', '5.0.0'],
	['5.2', '5.2.0'],
	['5.2.1', '5.2.1'],
	['5.2.1-SNAPSHOT', '5.2.1'],
	['5.2.1-20260902.123456-1', '5.2.1'],
	['dev', 'dev'],
])('normalizes BlackLab version %s to %s', (input, expected) => {
	expect(normalizeBlackLabVersion(input)).toBe(expected);
});

test('normalizes the server version exposed by normalized server info', () => {
	const normalized = normalizeServerInfo({
		apiVersion: '5',
		blacklabBuildTime: '',
		blacklabScmRevision: 'unknown',
		blacklabVersion: '5.0.0-SNAPSHOT',
		corpora: {},
		helpPageUrl: '',
		user: { canCreateIndex: false, loggedIn: false },
	});

	expect(normalized.blacklabVersion).toBe('5.0.0');
});

test('keeps an empty annotation group that requests remaining annotations', () => {
	const index = normalizeIndex(
		{
			annotatedFields: {
				contents: {
					annotations: {
						word: { custom: { displayName: 'Word' } },
						lemma: { custom: { displayName: 'Lemma' } },
						pos: { custom: { displayName: 'Part of speech' } },
					},
					count: { documents: 1, tokens: 1 },
					custom: { displayOrder: ['word', 'lemma', 'pos'] },
					hasContentStore: true,
					hasXmlTags: true,
					mainAnnotation: 'word',
				},
			},
			contentViewable: true,
			custom: {
				annotationGroups: {
					contents: [{ groupName: 'Basics', annotations: [], addRemainingAnnotations: true }],
				},
				description: '',
				displayName: 'Test corpus',
				textDirection: 'ltr',
			},
			count: { documents: 1, tokens: 1 },
			corpusName: 'test-corpus',
			mainAnnotatedField: 'contents',
			metadataFields: {},
			status: 'available',
			timeModified: '',
			versionInfo: { blacklabVersion: '4.4.0-SNAPSHOT', timeModified: '' },
		} as any,
		{ relations: {}, spans: {} },
		'5.3.0-SNAPSHOT',
	);

	expect(index.indexerVersion).toBe('4.4.0');
	expect(index.runtimeVersion).toBe('5.3.0');
	expect(index.annotationGroups).toEqual([{ annotatedFieldId: 'contents', id: 'Basics', entries: ['word', 'lemma', 'pos'], isRemainderGroup: false }]);
});
