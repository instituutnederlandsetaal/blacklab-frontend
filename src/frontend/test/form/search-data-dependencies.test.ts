// @vitest-environment jsdom

import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test, vi } from 'vitest';

import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField } from '@/types/apptypes';

import { normalizeIndex } from '@/shared/blacklab-helpers/normalize/normalize-corpus';
import { findOption, optionLabel, optionText, optionValues } from '@/shared/utils/options';

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

function createSearchFormCustomizations(defaultAnnotationId = 'lemma') {
	return {
		searchFormAdvancedAnnotationIds: () => ['lemma'],
		searchFormAdvancedDefaultAnnotationId: (availableValues: readonly string[]) => (availableValues.includes(defaultAnnotationId) ? defaultAnnotationId : (availableValues[0] ?? null)),
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

	test('creates querybuilder options outside Vue app context', () => {
		const index = createIndex();
		const customizations = createSearchFormCustomizations();

		const options = createQueryBuilderOptions({
			corpus: index,
			customizations,
			blacklabApi: createMockApi().blacklabApi,
			translate: createMockTranslate(),
		});

		expect(options.indexId).toBe('test-corpus');
	});

	test('builds querybuilder annotation options from the configured corpus subset', () => {
		const options = createQueryBuilderOptions({
			corpus: createIndex(),
			customizations: createSearchFormCustomizations(),
			blacklabApi: createMockApi().blacklabApi,
			translate: createMockTranslate(),
		});

		expect(options.defaultAnnotationId).toBe('lemma');
		expect(optionValues(options.annotationOptions)).toEqual(['lemma']);
		const annotationOption = findOption(options.annotationOptions, 'lemma');
		if (!annotationOption || typeof annotationOption === 'string') throw new Error('Expected a query-builder annotation option.');
		expect(optionLabel(annotationOption)).toBe('lemma');
		expect(optionText(annotationOption.title)).toBe('lemma description');
	});

	test('delegates querybuilder autocomplete to BlackLab with the annotation target', async () => {
		const index = createIndex();
		const getTermAutocomplete = vi.fn(() => resolvedRequest(['water']));
		const options = createQueryBuilderOptions({
			corpus: index,
			customizations: createSearchFormCustomizations(),
			blacklabApi: createMockApi({ blacklab: { getTermAutocomplete } }).blacklabApi,
			translate: createMockTranslate(),
		});

		await expect(options.autocomplete(index.annotatedFields.contents.annotations.lemma, 'wat')).resolves.toEqual(['water']);
		expect(getTermAutocomplete).toHaveBeenCalledWith('test-corpus', 'contents', 'lemma', 'wat');
	});

	test('uses an allowed querybuilder annotation when the configured default is stale', () => {
		const index = createIndex();
		const customizations = createSearchFormCustomizations('word');

		const options = createQueryBuilderOptions({
			corpus: index,
			customizations,
			blacklabApi: createMockApi().blacklabApi,
			translate: createMockTranslate(),
		});

		expect(optionValues(options.annotationOptions)).toEqual(['lemma']);
		expect(options.defaultAnnotationId).toBe('lemma');
	});
});
