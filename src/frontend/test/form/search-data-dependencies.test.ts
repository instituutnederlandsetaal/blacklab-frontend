// @vitest-environment jsdom

import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test, vi } from 'vitest';

import type { SearchFormConfiguration } from '@/features/search/model/search-form-configuration';
import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField } from '@/types/apptypes';

import { normalizeIndex } from '@/shared/blacklab-helpers/normalize/normalize-corpus';

function annotation(id: string, overrides: Partial<NormalizedAnnotation> = {}): NormalizedAnnotation {
	return {
		annotatedFieldId: 'contents',
		caseSensitive: false,
		defaultDescription: `${id} description`,
		defaultDisplayName: id,
		hasForwardIndex: true,
		id,
		isInternal: false,
		isMainAnnotation: id === 'word',
		offsetsAlternative: '',
		uiType: 'text',
		...overrides,
	};
}

function metadataField(id: string, overrides: Partial<NormalizedMetadataField> = {}): NormalizedMetadataField {
	return {
		defaultDescription: `${id} description`,
		defaultDisplayName: id,
		id,
		uiType: 'text',
		...overrides,
	};
}

function createIndex(): NormalizedIndex {
	const annotations = {
		word: annotation('word'),
		lemma: annotation('lemma'),
		pos: annotation('pos'),
		internal: annotation('internal', { isInternal: true }),
	};
	const metadataFields = {
		title: metadataField('title'),
		date: metadataField('date'),
		genre: metadataField('genre'),
	};

	return {
		annotatedFields: {
			contents: {
				annotations,
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
		annotationGroups: [
			{ annotatedFieldId: 'contents', id: 'Basics', entries: ['word', 'lemma'], isRemainderGroup: false },
			{ annotatedFieldId: 'contents', id: 'Other', entries: ['pos', 'internal'], isRemainderGroup: true },
		],
		contentViewable: true,
		description: '',
		displayName: 'Test corpus',
		documentCount: 1,
		fieldInfo: {} as NormalizedIndex['fieldInfo'],
		id: 'test-corpus',
		indexProgress: null,
		mainAnnotatedField: 'contents',
		metadataFieldGroups: [
			{ id: 'Bibliographic', entries: ['title', 'date'], isRemainderGroup: false },
			{ id: 'Other', entries: ['genre'], isRemainderGroup: true },
		],
		metadataFields,
		owner: null,
		relations: { relations: {}, spans: {} },
		status: 'available',
		textDirection: 'ltr',
		timeModified: '',
		tokenCount: 1,
	};
}

function createSearchFormConfiguration(): SearchFormConfiguration {
	return {
		simpleAnnotationId: 'word',
		extendedAnnotationIds: ['word'],
		queryBuilder: {
			annotationIds: ['lemma'],
			defaultAnnotationId: 'lemma',
		},
		metadataFieldIds: ['title'],
		within: { enabled: true, elements: [] },
		alignBy: { enabled: true, elements: [], defaultValue: '' },
		lexiconDatabase: '',
	};
}

describe('search form data dependencies', () => {
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
			} as any,
			{ relations: {}, spans: {} },
		);

		expect(index.annotationGroups).toEqual([{ annotatedFieldId: 'contents', id: 'Basics', entries: ['word', 'lemma', 'pos'], isRemainderGroup: false }]);
	});

	test('creates querybuilder options outside Vue app context', async () => {
		const index = createIndex();
		const configuration = createSearchFormConfiguration();
		const getTermAutocomplete = vi.fn(() => resolvedRequest(['water']));
		const api = createMockApi({
			blacklab: {
				getTermAutocomplete,
			},
		}).blacklabApi;

		const options = createQueryBuilderOptions({
			index,
			configuration,
			api,
			translate: createMockTranslate(),
		});

		expect(options.indexId).toBe('test-corpus');
		expect(options.defaultAnnotationId).toBe('lemma');
		expect(options.annotationOptions).toEqual([{ label: 'lemma', title: 'lemma description', value: 'lemma' }]);
		await expect(options.autocomplete(index.annotatedFields.contents.annotations.lemma, 'wat')).resolves.toEqual(['water']);
		expect(getTermAutocomplete).toHaveBeenCalledWith('test-corpus', 'contents', 'lemma', 'wat');
	});

	test('uses an allowed querybuilder annotation when the configured default is stale', () => {
		const index = createIndex();
		const configuration = createSearchFormConfiguration();
		configuration.queryBuilder.defaultAnnotationId = 'word';

		const options = createQueryBuilderOptions({
			index,
			configuration,
			api: createMockApi().blacklabApi,
			translate: createMockTranslate(),
		});

		expect(options.annotationOptions).toEqual([{ label: 'lemma', title: 'lemma description', value: 'lemma' }]);
		expect(options.defaultAnnotationId).toBe('lemma');
	});
});
