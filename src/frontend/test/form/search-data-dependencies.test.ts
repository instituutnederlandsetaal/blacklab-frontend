// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest';

import type { ModuleRootState } from '@/app/state/ui-state';
import { createQueryBuilderOptions } from '@/pages/search/model/query-builder-options';
import { normalizeIndex } from '@/shared/blacklab-helpers/normalize-responses';
import type { NormalizedAnnotation, NormalizedIndex, NormalizedMetadataField } from '@/types/apptypes';
import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';

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

function createSearchUiConfig(): ModuleRootState {
	return {
		search: {
			simple: { searchAnnotationId: 'word' },
			extended: {
				searchAnnotationIds: ['word'],
				splitBatch: { enabled: true },
			},
			advanced: {
				enabled: true,
				searchAnnotationIds: ['lemma'],
				defaultSearchAnnotationId: 'lemma',
			},
			expert: {},
			shared: {
				searchMetadataIds: ['title'],
				within: { enabled: true, elements: [], sentenceElement: null },
				alignBy: { enabled: true, elements: [], defaultValue: '' },
			},
		},
	} as unknown as ModuleRootState;
}

describe('search form data dependencies', () => {
	test('keeps an empty annotation group that requests remaining annotations', () => {
		const index = normalizeIndex(
			{
				annotatedFields: {
					contents: {
						annotations: {
							word: { displayName: 'Word' },
							lemma: { displayName: 'Lemma' },
							pos: { displayName: 'Part of speech' },
						},
						displayOrder: ['word', 'lemma', 'pos'],
						hasContentStore: true,
						hasXmlTags: true,
						mainAnnotation: 'word',
					},
				},
				contentViewable: true,
				custom: {
					annotationGroups: {
						contents: [{ name: 'Basics', annotations: [], addRemainingAnnotations: true }],
					},
					description: '',
					displayName: 'Test corpus',
					specialFields: {},
					textDirection: 'ltr',
				},
				documentCount: 1,
				mainAnnotatedField: 'contents',
				metadataFields: {},
				name: 'test-corpus',
				status: 'available',
				timeModified: '',
				tokenCount: 1,
			} as any,
			{ relations: {}, spans: {} },
		);

		expect(index.annotationGroups).toEqual([{ annotatedFieldId: 'contents', id: 'Basics', entries: ['word', 'lemma', 'pos'], isRemainderGroup: false }]);
	});

	test('creates querybuilder options outside Vue app context', async () => {
		const index = createIndex();
		const searchUi = createSearchUiConfig();
		const getTermAutocomplete = vi.fn(() => createMockApi({ blacklab: { getTermAutocomplete: ['water'] } }).blacklabApi.getTermAutocomplete('', '', '', ''));
		const api = createMockApi({
			overrides: {
				blacklab: {
					getTermAutocomplete,
				},
			},
		}).blacklabApi;

		const options = createQueryBuilderOptions({
			index,
			searchUi,
			api,
			translate: createMockTranslate(),
		});

		expect(options.indexId).toBe('test-corpus');
		expect(options.defaultAnnotationId).toBe('lemma');
		expect(options.annotationOptions).toEqual([{ label: 'lemma', title: 'lemma description', value: 'lemma' }]);
		await expect(options.autocomplete(index.annotatedFields.contents.annotations.lemma, 'wat')).resolves.toEqual(['water']);
		expect(getTermAutocomplete).toHaveBeenCalledWith('test-corpus', 'contents', 'lemma', 'wat');
	});
});
