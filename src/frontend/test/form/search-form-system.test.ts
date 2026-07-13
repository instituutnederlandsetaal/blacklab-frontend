// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import type { Corpus } from '@/app/state/useCorpusContext';
import { FormSystem, restoreScopedFormState } from '@/features/form';
import { createSearchFormSystem, getNewSearchFormId, hasNewSearchFormForPattern } from '@/features/search/model/search-form-builder';
import { createLegacySearchFormConfiguration, snapshotSearchFormConfiguration } from '@/features/search/model/search-form-configuration';
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

function createParallelCorpus(): Corpus {
	const corpus = createCorpus();
	const createParallelField = (version: string): Corpus['parallelAnnotatedFields'][number] => {
		const id = `contents__${version}`;
		const annotations = Object.fromEntries(Object.values(corpus.allAnnotationsMap).map(item => [item.id, { ...item, annotatedFieldId: id }]));
		return {
			annotations,
			defaultDescription: '',
			defaultDisplayName: version.toUpperCase(),
			hasContentStore: true,
			hasLengthTokens: true,
			hasXmlTags: true,
			id,
			isAnnotatedField: true,
			isParallel: true,
			mainAnnotationId: 'word',
			prefix: 'contents',
			version,
		};
	};
	const source = createParallelField('en');
	const target = createParallelField('nl');

	return {
		...corpus,
		allAnnotatedFields: [source, target],
		allAnnotatedFieldsMap: { [source.id]: source, [target.id]: target },
		allAnnotations: Object.values(source.annotations),
		allAnnotationsMap: source.annotations,
		annotatedFields: { [source.id]: source, [target.id]: target },
		annotationGroups: corpus.annotationGroups.map(group => ({
			...group,
			annotatedFieldId: source.id,
			fields: group.entries.map(id => source.annotations[id]),
		})),
		firstMainAnnotation: source.annotations.word,
		isParallelCorpus: true,
		mainAnnotatedField: source.id,
		parallelAnnotatedFields: [source, target],
		parallelAnnotatedFieldsMap: { [source.id]: source, [target.id]: target },
		parallelFieldPrefix: 'contents',
	};
}

function createDefinition(corpus = createCorpus()) {
	return createSearchFormSystem({
		blacklabApi: createMockApi().blacklabApi,
		configuration: createLegacySearchFormConfiguration(),
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
	state.search.shared.alignBy.enabled = false;
	state.search.shared.alignBy.elements = [];
	state.search.shared.alignBy.defaultValue = '';
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
			{ group: 'Basics', id: 'word', label: 'word', value: 'water', summaryType: ['patt'] },
			{ group: 'Bibliographic', id: 'shared.filters.Bibliographic.author', label: 'author', value: 'Austen', summaryType: ['filter'] },
			{ group: 'Classification', id: 'shared.filters.Classification.genre', label: 'genre', value: 'Fiction', summaryType: ['filter'] },
		]);
	});

	test('simple form includes and compiles configured shared filters', () => {
		const definition = createDefinition();

		definition.state.state.value['search.simple.annotation'] = {
			value: 'water',
			caseSensitive: false,
		};
		definition.state.state.value['shared.filters.Bibliographic.author'] = {
			value: 'Austen',
			caseSensitive: false,
		};

		expect(definition.compile(getNewSearchFormId('simple'))).toMatchObject({
			filter: 'author:(Austen)',
			patt: '[word="(?i)water"]',
		});
	});

	test('rebuilds from a new legacy configuration snapshot', () => {
		const state = UIStore.getState();
		const system = createSearchFormSystem({
			blacklabApi: createMockApi().blacklabApi,
			configuration: createLegacySearchFormConfiguration(),
			corpus: ref(createCorpus()),
			tagset: ref(undefined),
			translate: createMockTranslate(),
		});
		const initialDefinition = system.definition.value!;

		state.search.simple.searchAnnotationId = 'lemma';
		state.search.extended.searchAnnotationIds = ['pos'];
		state.search.shared.searchMetadataIds = ['genre'];

		const configuredDefinition = system.definition.value!;
		expect(configuredDefinition).not.toBe(initialDefinition);
		expect((configuredDefinition.getField('search.simple.annotation') as unknown as { annotationId: string }).annotationId).toBe('lemma');
		expect(configuredDefinition.getField('search.extended.annotations.Basics.word')).toBeNull();
		expect(configuredDefinition.getField('search.extended.annotations.pos')).not.toBeNull();
		expect(configuredDefinition.getField('shared.filters.Bibliographic.author')).toBeNull();
		expect(configuredDefinition.getField('shared.filters.Classification.genre')).not.toBeNull();
	});

	test('takes an isolated copy of mutable legacy configuration values', () => {
		const state = UIStore.getState();
		state.search.shared.within.elements = [{ value: 's', label: 'Sentence', title: 'sentence title' }];
		const snapshot = snapshotSearchFormConfiguration(state);

		state.search.extended.searchAnnotationIds.push('word_or_lemma');
		state.search.shared.within.elements[0].label = 'Changed';

		expect(snapshot.extendedAnnotationIds).toEqual(['word', 'lemma', 'pos']);
		expect(snapshot.within.elements).toEqual([{ value: 's', label: 'Sentence', title: 'sentence title' }]);
	});

	test('preserves configured within options, labels, and order', () => {
		const corpus = createCorpus();
		corpus.relations = {
			relations: {},
			spans: {
				p: { count: 1 },
				s: { count: 1 },
			},
		};
		const state = UIStore.getState();
		state.search.shared.within.enabled = true;
		state.search.shared.within.elements = [
			{ value: 'p', label: 'Custom paragraph', title: 'Paragraph title' },
			{ value: 's', label: 'Custom sentence', title: null },
		];

		const within = createDefinition(corpus).getField('shared.within') as unknown as {
			options: Array<{ value: string; label?: string; title?: string | null }>;
		};

		expect(within.options.map(option => option.value)).toEqual(['', 'p', 's']);
		expect(within.options[1]).toMatchObject({ value: 'p', label: 'Custom paragraph', title: 'Paragraph title' });
		expect(within.options[2]).toMatchObject({ value: 's', label: 'Custom sentence', title: null });
	});

	test('uses the configured align-by visibility, options, and default', () => {
		const state = UIStore.getState();
		state.search.shared.alignBy.elements = [
			{ value: 'sentence-alignment', label: 'By sentence', title: 'Sentence alignment' },
			{ value: 'word-alignment', label: 'By word', title: null },
		];
		state.search.shared.alignBy.defaultValue = 'sentence-alignment';

		const hiddenDefinition = createDefinition(createParallelCorpus());
		const hiddenField = hiddenDefinition.getField('search.simple.parallel') as unknown as { alignByOptions: unknown[] };
		expect(hiddenField.alignByOptions).toEqual([]);
		expect((hiddenDefinition.state.state.value['search.simple.parallel'] as { alignBy: string | null }).alignBy).toBe('sentence-alignment');

		state.search.shared.alignBy.enabled = true;
		const visibleDefinition = createDefinition(createParallelCorpus());
		const visibleField = visibleDefinition.getField('search.simple.parallel') as unknown as { alignByOptions: unknown[] };
		expect(visibleField.alignByOptions).toEqual([
			{ value: 'sentence-alignment', label: 'By sentence', title: 'Sentence alignment' },
			{ value: 'word-alignment', label: 'By word', title: null },
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
