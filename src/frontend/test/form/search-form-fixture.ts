import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { effectScope } from 'vue';

import * as UIStore from '@/app/legacy-stores/ui-store';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import { createCorpusValue } from '@/features/corpus/corpus-context';
import type { FormRuntime } from '@/features/form';
import { restoreSubmittedForm } from '@/pages/search/bindings/search-form-binding';
import { readSubmittedSearch } from '@/pages/search/bindings/search-query';
import { createSearchFormSystem } from '@/pages/search/model/form/search-form-system';
import type { Corpus, NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';

import debug from '@/shared/debug/debug';

export function annotation(id: string, overrides: Partial<NormalizedAnnotation> = {}): NormalizedAnnotation {
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

export function createCorpus(): Corpus {
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

	return createCorpusValue({
		annotatedFields: { contents: mainField },
		annotationGroups: [
			{ annotatedFieldId: 'contents', entries: ['word', 'lemma', 'word_or_lemma'], id: 'Basics', isRemainderGroup: false },
			{ annotatedFieldId: 'contents', entries: ['pos'], id: 'Grammar', isRemainderGroup: false },
		],
		contentViewable: true,
		description: '',
		displayName: 'Test corpus',
		documentCount: 1,
		fieldInfo: {},
		id: 'test-corpus',
		indexProgress: null,
		indexerVersion: '4.4.0',
		mainAnnotatedField: 'contents',
		metadataFieldGroups: [
			{ entries: ['author'], id: 'Bibliographic', isRemainderGroup: false },
			{ entries: ['genre'], id: 'Classification', isRemainderGroup: false },
		],
		metadataFields,
		owner: null,
		relations: { spans: {} },
		runtimeVersion: '5.0.0',
		status: 'available',
		textDirection: 'ltr',
		timeModified: '',
		tokenCount: 1,
	});
}

export function createParallelCorpus(): Corpus {
	const corpus = createCorpus();
	const createParallelField = (version: string): Corpus['parallelAnnotatedFields'][number] => {
		const id = `contents__${version}`;
		const annotations = Object.fromEntries(Object.values(corpus.allAnnotationsMap).map(item => [item.id, { ...item, annotatedFieldId: id }]));
		return {
			...corpus.allAnnotatedFieldsMap.contents,
			annotations,
			defaultDisplayName: version.toUpperCase(),
			id,
			isParallel: true,
			prefix: 'contents',
			version,
		};
	};
	const source = createParallelField('en');
	const target = createParallelField('nl');

	return createCorpusValue({
		...corpus,
		annotatedFields: { [source.id]: source, [target.id]: target },
		annotationGroups: corpus.annotationGroups.map(group => ({ ...group, annotatedFieldId: source.id })),
		mainAnnotatedField: source.id,
	});
}

function resetSearchFormConfig() {
	const state = UIStore.getState();
	state.search.simple.searchAnnotationId = 'word';
	state.search.extended.searchAnnotationIds = ['word', 'lemma', 'pos'];
	state.search.advanced.enabled = true;
	state.search.advanced.searchAnnotationIds = ['word', 'lemma', 'pos'];
	state.search.advanced.defaultSearchAnnotationId = 'word';
	state.search.shared.searchMetadataIds = ['author', 'genre'];
	state.search.shared.within.enabled = false;
	state.search.shared.within.elements = [];
	state.search.shared.within.sentenceElement = null;
	state.search.shared.alignBy.enabled = false;
	state.search.shared.alignBy.elements = [];
	state.search.shared.alignBy.defaultValue = '';
	state.explore.searchAnnotationIds = ['word', 'lemma', 'pos'];
	state.explore.defaultSearchAnnotationId = 'word';
	state.results.shared.groupAnnotationIds = ['word', 'lemma', 'pos'];
	state.explore.defaultGroupAnnotationId = 'word';
	state.results.shared.groupMetadataIds = ['author', 'genre'];
	state.explore.defaultGroupMetadataId = 'author';
	state.dropdowns.groupBy.annotationGroupLabelsVisible = false;
	state.dropdowns.groupBy.metadataGroupLabelsVisible = false;
}

export function createSearchFormFixture() {
	const scope = effectScope();
	const registry = createCustomizationRegistry(createCorpus());
	debug.value = false;
	resetSearchFormConfig();

	function createSystem(
		options: Omit<Parameters<typeof createSearchFormSystem>[0], 'customizations'> = {
			blacklabApi: createMockApi().blacklabApi,
			corpus: createCorpus(),
			translate: createMockTranslate(),
		},
	) {
		return scope.run(() =>
			createSearchFormSystem({
				...options,
				customizations: createCustomizations(registry, options.corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId),
			}),
		)!;
	}

	function createRuntime(corpus = createCorpus()) {
		return createSystem({ blacklabApi: createMockApi().blacklabApi, corpus, translate: createMockTranslate() }).runtime.value!;
	}

	return { scope, registry, createSystem, createRuntime };
}

export type SearchFormFixture = ReturnType<typeof createSearchFormFixture>;

export function readSearchFormState(runtime: FormRuntime, query: Parameters<typeof readSubmittedSearch>[0]) {
	return restoreSubmittedForm(runtime, readSubmittedSearch(query)).state;
}

export function selectRenderedForm(runtime: FormRuntime, formId: string) {
	const explore = ids.formKind(formId) === 'explore';
	runtime.state.uiState.value[ids.root()] = explore ? ids.exploreSection() : ids.searchSection();
	runtime.state.uiState.value[explore ? ids.exploreFormsContainer() : ids.searchFormsContainer()] = formId;
}
