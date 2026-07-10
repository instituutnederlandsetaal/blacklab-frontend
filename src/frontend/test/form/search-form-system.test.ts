// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import type { Corpus } from '@/app/state/useCorpusContext';
import { FormSystem, restoreScopedFormState } from '@/features/form';
import { createSearchFormSystem, getNewSearchFormId, hasNewSearchFormForPattern } from '@/features/search/model/search-form-system';
import type { NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';

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

function createCorpus(): Corpus {
	const annotations = {
		word: annotation('word'),
		lemma: annotation('lemma'),
		word_or_lemma: annotation('word_or_lemma'),
		pos: annotation('pos', {
			uiType: 'select',
			values: [
				{ value: 'NOU', label: 'Noun', title: null },
				{ value: 'VRB', label: 'Verb', title: null },
			],
		}),
	};
	const metadataFields = {
		author: metadataField('author'),
		genre: metadataField('genre', {
			uiType: 'select',
			values: [
				{ value: 'fiction', label: 'Fiction', title: null },
				{ value: 'non-fiction', label: 'Non-fiction', title: null },
			],
		}),
	};
	const mainField = {
		annotations,
		defaultDescription: '',
		defaultDisplayName: 'Contents',
		hasContentStore: true,
		hasLengthTokens: true,
		hasXmlTags: true,
		id: 'contents',
		isAnnotatedField: true,
		isParallel: false as const,
		mainAnnotationId: 'word',
	};

	return {
		allAnnotatedFields: [mainField],
		allAnnotatedFieldsMap: { contents: mainField },
		allAnnotations: Object.values(annotations),
		allAnnotationsMap: annotations,
		allMetadataFields: Object.values(metadataFields),
		allMetadataFieldsMap: metadataFields,
		annotatedFields: { contents: mainField },
		annotationGroups: [
			{ annotatedFieldId: 'contents', entries: ['word', 'lemma', 'word_or_lemma'], fields: [annotations.word, annotations.lemma, annotations.word_or_lemma], id: 'Basics', isRemainderGroup: false },
			{ annotatedFieldId: 'contents', entries: ['pos'], fields: [annotations.pos], id: 'Grammar', isRemainderGroup: false },
		],
		contentViewable: true,
		description: '',
		displayName: 'Test corpus',
		documentCount: 1,
		fieldInfo: {},
		firstMainAnnotation: annotations.word,
		hasRelations: false,
		id: 'test-corpus',
		indexProgress: null,
		isParallelCorpus: false,
		mainAnnotatedField: 'contents',
		metadataFieldGroups: [
			{ entries: ['author'], id: 'Bibliographic', isRemainderGroup: false },
			{ entries: ['genre'], id: 'Classification', isRemainderGroup: false },
		],
		metadataFields,
		metadataGroups: [
			{ entries: ['author'], fields: [metadataFields.author], id: 'Bibliographic', isRemainderGroup: false },
			{ entries: ['genre'], fields: [metadataFields.genre], id: 'Classification', isRemainderGroup: false },
		],
		owner: null,
		parallelAnnotatedFields: [],
		parallelAnnotatedFieldsMap: {},
		parallelFieldPrefix: '',
		relations: { relations: {}, spans: {} },
		status: 'available',
		textDirection: 'ltr',
		timeModified: '',
		tokenCount: 1,
	};
}

function createDefinition(corpus = createCorpus()) {
	return createSearchFormSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus: ref(corpus),
		tagset: ref(undefined),
		translate: createMockTranslate(),
	}).definition.value!;
}

beforeEach(() => {
	const state = UIStore.getState();
	state.search.simple.searchAnnotationId = 'word';
	state.search.extended.searchAnnotationIds = ['word', 'lemma', 'pos'];
	state.search.shared.searchMetadataIds = ['author', 'genre'];
	state.search.shared.within.enabled = false;
	state.search.shared.within.elements = [];
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('search form system', () => {
	test('builds an extended search form with grouped annotation and shared filter nodes', () => {
		const definition = createDefinition();

		expect(hasNewSearchFormForPattern(definition, 'extended')).toBe(true);
		expect(definition.getForm(getNewSearchFormId('extended'))).not.toBeNull();
		expect(definition.getContainer('search.extended.annotations')).not.toBeNull();
		expect(definition.getContainer('search.extended.annotations.Basics')).not.toBeNull();
		expect(definition.getContainer('shared.filters')).not.toBeNull();
		expect(definition.getField('shared.filters.Bibliographic.author')).not.toBeNull();
		expect(definition.getField('shared.filters.Classification.genre')).not.toBeNull();
	});

	test('extended form compiles annotation fields with shared filters', () => {
		const definition = createDefinition();

		definition.state.state.value['search.extended.annotations.Basics.word'] = {
			value: 'water',
			caseSensitive: false,
		};
		definition.state.state.value['shared.filters.Bibliographic.author'] = {
			value: 'Austen',
			caseSensitive: false,
		};
		definition.state.state.value['shared.filters.Classification.genre'] = ['fiction'];

		const compiled = definition.compile(getNewSearchFormId('extended'));

		expect(compiled.patt).toBe('[word="(?i)water"]');
		expect(compiled.filter).toBe('(author:(Austen) AND genre:(fiction))');
		expect(compiled.summaries).toEqual([
			{ group: 'Basics', id: 'word', label: 'word', value: 'water' },
			{ group: 'Bibliographic', id: 'shared.filters.Bibliographic.author', label: 'author', value: 'Austen' },
			{ group: 'Classification', id: 'shared.filters.Classification.genre', label: 'genre', value: 'Fiction' },
		]);
	});

	test('keeps within field defaults when rendering after a simple-search URL restore', () => {
		const corpus = createCorpus();
		corpus.relations = {
			relations: {},
			spans: {
				p: { count: 1 },
				s: {
					count: 1,
					attributes: {
						type: { valueListComplete: true, values: { quote: 1 } },
					},
				},
			},
		};
		const state = UIStore.getState();
		state.search.shared.within.enabled = true;
		state.search.shared.within.elements = [
			{ value: 's', label: 'Sentence', title: null },
			{ value: 'p', label: 'Paragraph', title: null },
		];
		const definition = createDefinition(corpus);
		const restored = restoreScopedFormState(definition, {
			'f.form': 'search.simple',
			'f.word': 'schip',
			patt: '[word_or_lemma="(?i)schip"]',
		});
		definition.state.replaceState(restored);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		mount(FormSystem, {
			props: {
				definition,
				rootId: 'search.extended',
			},
		});

		expect(definition.state.state.value['shared.within']).toEqual({ element: null, attributes: {} });
		expect(warn.mock.calls.find(call => String(call[0]).includes('Invalid prop') && String(call[0]).includes('modelValue'))).toBeUndefined();
	});

	test('restores the extended annotation value from scoped URL state', () => {
		const state = UIStore.getState();
		state.search.extended.searchAnnotationIds = ['word_or_lemma', 'pos'];
		const definition = createDefinition();
		const restored = restoreScopedFormState(definition, {
			'f.form': 'search.extended',
			'f.word_or_lemma': 'schip',
			patt: '[word_or_lemma="(?i)schip"]',
			searchfield: 'contents',
		});
		definition.state.replaceState(restored);

		expect(restored.issues).toEqual([]);
		expect(restored.activeFormId).toBe('search.extended');
		expect(definition.state.state.value['search.extended.annotations.Basics.word_or_lemma']).toEqual({
			value: 'schip',
			caseSensitive: false,
		});
		expect(definition.compile('search.extended')).toMatchObject({
			encoded: {
				'f.form': 'search.extended',
				'f.word_or_lemma': 'schip',
			},
			patt: '[word_or_lemma="(?i)schip"]',
			searchfield: 'contents',
		});
	});

	test('activates the extended annotation tab that contains restored values', () => {
		const state = UIStore.getState();
		state.search.extended.searchAnnotationIds = ['word_or_lemma', 'pos'];
		const definition = createDefinition();
		const restored = restoreScopedFormState(definition, {
			'f.form': 'search.extended',
			'f.pos': 'NOU',
		});

		expect(restored.uiState['search.extended.annotations']).toBe('search.extended.annotations.Grammar');
		expect(restored.uiState['search.extended.annotations.Grammar']).toBe('search.extended.annotations.Grammar.pos');
	});
});
