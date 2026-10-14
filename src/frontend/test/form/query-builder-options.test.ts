// @vitest-environment jsdom

import { createMockApi, resolvedRequest } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { describe, expect, test, vi } from 'vitest';

import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField } from '@/types/apptypes';

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
		indexerVersion: '4.4.0',
		mainAnnotatedField: 'contents',
		metadataFieldGroups: [
			{ id: 'Bibliographic', entries: ['title', 'date'], isRemainderGroup: false },
			{ id: 'Other', entries: ['genre'], isRemainderGroup: true },
		],
		metadataFields,
		owner: null,
		relations: { relations: {}, spans: {} },
		runtimeVersion: '5.0.0',
		status: 'available',
		textDirection: 'ltr',
		timeModified: '',
		tokenCount: 1,
	};
}

function createSearchFormCustomizations() {
	return {
		searchFormAdvancedAnnotationIds: () => ['lemma'],
		searchFormAdvancedDefaultAnnotationId: () => 'lemma',
	};
}

describe('query-builder options', () => {
	test('builds querybuilder annotation options from the configured corpus subset', () => {
		const options = createQueryBuilderOptions({
			corpus: createIndex(),
			customizations: createSearchFormCustomizations(),
			blacklabApi: createMockApi().blacklabApi,
			translate: createMockTranslate(),
		});

		expect(options.indexId).toBe('test-corpus');
		expect(options.defaultAnnotationId).toBe('lemma');
		expect(optionValues(options.annotationOptions)).toEqual(['lemma']);
		const annotationOption = findOption(options.annotationOptions, 'lemma');
		if (!annotationOption || typeof annotationOption === 'string') throw new Error('Expected a query-builder annotation option.');
		expect(optionLabel(annotationOption)).toBe('lemma');
		expect(optionText(annotationOption.title)).toBe('lemma description');
	});

	test('accepts a feature-specific annotation selection', () => {
		const options = createQueryBuilderOptions(
			{
				corpus: createIndex(),
				customizations: createSearchFormCustomizations(),
				blacklabApi: createMockApi().blacklabApi,
				translate: createMockTranslate(),
			},
			{ annotationIds: ['word', 'lemma'], defaultAnnotationId: 'word' },
		);

		expect(optionValues(options.annotationOptions)).toEqual(['word', 'lemma']);
		expect(options.defaultAnnotationId).toBe('word');
	});

	test('disambiguates only duplicate annotation display names', () => {
		const index = createIndex();
		index.annotatedFields.contents.annotations.word.defaultDisplayName = 'Word';
		index.annotatedFields.contents.annotations.lemma.defaultDisplayName = 'Word';
		index.annotatedFields.contents.annotations.pos.defaultDisplayName = 'Part of speech';
		const options = createQueryBuilderOptions(
			{
				corpus: index,
				customizations: createSearchFormCustomizations(),
				blacklabApi: createMockApi().blacklabApi,
				translate: createMockTranslate(),
			},
			{ annotationIds: ['word', 'lemma', 'pos'], defaultAnnotationId: 'word' },
		);

		expect(optionLabel(findOption(options.annotationOptions, 'word')!)).toBe('Word (word)');
		expect(optionLabel(findOption(options.annotationOptions, 'lemma')!)).toBe('Word (lemma)');
		expect(optionLabel(findOption(options.annotationOptions, 'pos')!)).toBe('Part of speech');
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
});
