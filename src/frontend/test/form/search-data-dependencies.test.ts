import { describe, expect, test, vi } from 'vitest';

import defaultPageConfig from '@/entities/page-config/page-config.default';
import { resolveSearchUiConfig } from '@/pages/search/config/search-ui-config';
import { createSearchFormDefinition } from '@/pages/search/form/model/search-form-builder';
import { createQueryBuilderOptions } from '@/pages/search/form/model/query-builder-options';
import type { NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField } from '@/types/apptypes';

import { resolvedRequest } from '../mocks/api';

import { createMockTranslate } from '@/shared/i18n/mock';

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

describe('search UI config resolution', () => {
	test('derives defaults from the loaded corpus shape', () => {
		const config = resolveSearchUiConfig(createIndex());

		expect(config.search.simple.searchAnnotationId).toBe('word');
		expect(config.search.extended.searchAnnotationIds).toEqual(['word', 'lemma']);
		expect(config.search.advanced.searchAnnotationIds).toEqual(['word', 'lemma']);
		expect(config.search.advanced.defaultSearchAnnotationId).toBe('word');
		expect(config.search.shared.searchMetadataIds).toEqual(['title', 'date']);
	});

	test('drops invalid configured ids and corrects the querybuilder default', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		const config = resolveSearchUiConfig(createIndex(), {
			search: {
				simple: { searchAnnotationId: 'missing-simple' },
				extended: { searchAnnotationIds: ['lemma', 'missing-extended'] },
				advanced: { enabled: true, searchAnnotationIds: ['pos'], defaultSearchAnnotationId: 'missing-default' },
				expert: {},
				shared: {
					searchMetadataIds: ['date', 'missing-metadata'],
					within: { enabled: true, elements: [], sentenceElement: null },
					alignBy: { enabled: true, elements: [], defaultValue: '' },
				},
			},
		} as any);

		expect(config.search.simple.searchAnnotationId).toBe('word');
		expect(config.search.extended.searchAnnotationIds).toEqual(['lemma']);
		expect(config.search.advanced.searchAnnotationIds).toEqual(['pos']);
		expect(config.search.advanced.defaultSearchAnnotationId).toBe('pos');
		expect(config.search.shared.searchMetadataIds).toEqual(['date']);
		expect(warn).toHaveBeenCalled();

		warn.mockRestore();
	});
});

describe('search form dependency boundaries', () => {
	test('creates querybuilder options outside Vue app context', async () => {
		const index = createIndex();
		const searchUi = resolveSearchUiConfig(index, {
			search: {
				simple: { searchAnnotationId: 'word' },
				extended: { searchAnnotationIds: ['word'] },
				advanced: { enabled: true, searchAnnotationIds: ['lemma'], defaultSearchAnnotationId: 'lemma' },
				expert: {},
				shared: {
					searchMetadataIds: ['title'],
					within: { enabled: true, elements: [], sentenceElement: null },
					alignBy: { enabled: true, elements: [], defaultValue: '' },
				},
			},
		} as any);
		const getTermAutocomplete = vi.fn(() => resolvedRequest(['water']));

		const options = createQueryBuilderOptions({
			index,
			searchUi,
			api: { getTermAutocomplete } as any,
			translate: createMockTranslate(),
		});

		expect(options.indexId).toBe('test-corpus');
		expect(options.defaultAnnotationId).toBe('lemma');
		expect(options.annotationOptions).toEqual([{ label: 'lemma', title: 'lemma description', value: 'lemma' }]);
		await expect(options.autocomplete(index.annotatedFields.contents.annotations.lemma, 'wat')).resolves.toEqual(['water']);
		expect(getTermAutocomplete).toHaveBeenCalledWith('test-corpus', 'contents', 'lemma', 'wat');
	});

	test('creates the search form definition outside Vue app context', () => {
		const index = createIndex();
		const searchUi = resolveSearchUiConfig(index);

		const blueprint = createSearchFormDefinition(
			{ config: defaultPageConfig, index, tagset: undefined },
			searchUi,
			{ getTermAutocomplete: vi.fn(() => resolvedRequest([])), getMetadataAutocomplete: vi.fn(() => resolvedRequest([])) } as any,
			createMockTranslate(),
		);

		expect(blueprint.rootId).toBe('root');
		expect(blueprint.definition.root.children.map(child => child.id)).toContain('search');
	});
});
