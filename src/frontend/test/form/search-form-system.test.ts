// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref, toValue, type EffectScope } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import { normalizeTagset } from '@/features/corpus/model/tagset-state';
import type { CqlQueryBuilderData } from '@/features/cql-query-builder/model';
import {
	FormSystem,
	RangeField,
	restoreFormState,
	SelectField,
	summarizeAnnotationPosState,
	TextField,
	type AnnotationPosFieldConfig,
	type ParallelFieldState,
	type TokenSequenceFieldState,
} from '@/features/form';
import { createSearchFormSystem } from '@/features/search/model/form/search-form-system';
import type { Corpus, NormalizedAnnotation, NormalizedMetadataField } from '@/types/apptypes';

import debug from '@/shared/debug/debug';
import { findOption, optionLabel, optionText, optionTitle, optionValues, type Options, type OptionText } from '@/shared/utils/options';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

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

let testScope: EffectScope;
const customizationRegistry = createCustomizationRegistry(createCorpus());

function createScopedSearchFormSystem(options: Omit<Parameters<typeof createSearchFormSystem>[0], 'customizations'>) {
	return testScope.run(() =>
		createSearchFormSystem({
			...options,
			customizations: createCustomizations(customizationRegistry, options.corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId),
		}),
	)!;
}

function createDefinition(corpus = createCorpus()) {
	return createScopedSearchFormSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus: ref(corpus),
		tagset: ref(undefined),
		translate: createMockTranslate(),
	}).runtime.value!;
}

function createLocalizedSearchSystem() {
	const locale = ref('en');
	const translate = createMockTranslate();
	const translated = {
		...translate,
		$t: (key: string, params?: Record<string, unknown>) => `${locale.value}:${key}${typeof params?.field === 'string' ? `:${params.field}` : ''}`,
		$tAnnotDisplayName: (value: Pick<NormalizedAnnotation, 'id'>) => `${locale.value}:${value.id}`,
		$tAnnotDescription: (value: Pick<NormalizedAnnotation, 'id'>) => `${locale.value}:${value.id}:description`,
		$tAnnotGroupName: (value: { id: string }) => `${locale.value}:${value.id}`,
		$tMetaDisplayName: (value: { id: string }) => `${locale.value}:${value.id}`,
		$tMetaGroupName: <T extends string | undefined | null>(value: { id: string } | T) => {
			if (!value) return undefined as T;
			return `${locale.value}:${typeof value === 'string' ? value : value.id}`;
		},
	};
	const system = createScopedSearchFormSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus: ref(createCorpus()),
		tagset: ref(undefined),
		translate: translated,
	});
	const runtime = system.runtime.value!;
	const annotationOptions = (runtime.definition.getField(ids.exploreNgramGroupBy()) as unknown as { options: Options }).options;
	const metadataOptions = (runtime.definition.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options }).options;
	const annotationOption = findOption(annotationOptions, 'word');
	const metadataOption = findOption(metadataOptions, 'field:author');
	const tokenSequence = runtime.definition.getField(ids.exploreNgramTokens()) as unknown as {
		selectorDisplayName: string | (() => string);
		selectorPlaceholder: string | (() => string);
	};
	if (!annotationOption || !metadataOption) throw new Error('Expected deferred Explore options.');

	return { annotationOption, annotationOptions, locale, metadataOption, metadataOptions, runtime, system, tokenSequence };
}

function createLocalizedPosSystem() {
	const corpus = createCorpus();
	const pos = corpus.allAnnotationsMap.pos;
	pos.uiType = 'pos';
	pos.subAnnotations = undefined;
	const number = annotation('number', { defaultDisplayName: 'Number from corpus', parentAnnotationId: 'pos' });
	corpus.allAnnotations.push(number);
	corpus.allAnnotationsMap.number = number;
	corpus.allAnnotatedFieldsMap.contents.annotations.number = number;
	const normalizedTagset = normalizeTagset(pos, corpus.allAnnotatedFieldsMap.contents.annotations, {
		values: {
			NOU: { value: 'NOU', displayName: 'Noun', subAnnotationIds: ['number'] },
		},
		subAnnotations: {
			number: {
				id: 'number',
				displayName: 'Grammatical number',
				values: [{ value: 'sg', displayName: 'Singular', pos: ['NOU'] }],
			},
		},
	});
	const locale = ref('en');
	const translate = createMockTranslate();
	const system = createScopedSearchFormSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus: ref(corpus),
		tagset: ref(normalizedTagset),
		translate: {
			...translate,
			$tAnnotDisplayName: (value: Pick<NormalizedAnnotation, 'id' | 'defaultDisplayName'>) => `${locale.value}:${value.defaultDisplayName || value.id}`,
			$tAnnotDescription: (value: Pick<NormalizedAnnotation, 'id' | 'defaultDescription'>) => `${locale.value}:${value.defaultDescription || value.id}`,
		},
	});
	const runtime = system.runtime.value!;
	const fieldId = ids.annotationField('extended', 'contents', 'pos');
	const field = runtime.definition.getField(fieldId) as unknown as AnnotationPosFieldConfig & {
		subAnnotationLabels: NonNullable<AnnotationPosFieldConfig['subAnnotationLabels']>;
	};
	const selection = { pos: ['NOU'], number: ['sg'] };

	return { field, fieldId, locale, runtime, selection, system };
}

function createCustomizedWithinRuntime() {
	const corpus = createCorpus();
	const registry = createCustomizationRegistry(corpus);
	registry.registerForm(form => {
		form.addSpanFilter({ elementName: 'speech', attributeName: 'person', control: 'text', groupId: 'Bibliographic', insertBefore: 'author', defaultDisplayName: 'Speaker' });
		form.addSpanFilter({ elementName: 'speech', attributeName: 'role', control: 'select', options: [{ value: 'host', label: 'Host' }], groupId: 'Span filters', defaultDisplayName: 'Role' });
		form.addSpanFilter({ elementName: 'p', attributeName: 'n', control: 'range', groupId: 'Span filters', defaultDisplayName: 'Paragraph' });
	});
	const runtime = testScope.run(
		() =>
			createSearchFormSystem({
				blacklabApi: createMockApi().blacklabApi,
				corpus: ref(corpus),
				customizations: createCustomizations(registry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId),
				tagset: ref(undefined),
				translate: createMockTranslate(),
			}).runtime.value!,
	)!;
	return { personFieldId: ids.withinFilter('speech', 'person'), runtime };
}

function createLegacyBackedSearchSystem() {
	return createScopedSearchFormSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus: ref(createCorpus()),
		tagset: ref(undefined),
		translate: createMockTranslate(),
	});
}

beforeEach(() => {
	testScope = effectScope();
	debug.value = false;
	const state = UIStore.getState();
	state.search.simple.searchAnnotationId = 'word';
	state.search.extended.searchAnnotationIds = ['word', 'lemma', 'pos'];
	state.search.advanced.enabled = true;
	state.search.advanced.searchAnnotationIds = ['word', 'lemma', 'pos'];
	state.search.advanced.defaultSearchAnnotationId = 'word';
	state.search.shared.searchMetadataIds = ['author', 'genre'];
	state.search.shared.within.enabled = false;
	state.search.shared.within.elements = [];
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
});

afterEach(() => {
	testScope.stop();
	vi.restoreAllMocks();
});

enableAutoUnmount(afterEach);

describe('search form system', () => {
	test('updates deferred Explore option and selector text when locale changes', () => {
		const { annotationOption, locale, metadataOption, tokenSequence } = createLocalizedSearchSystem();
		expect(optionLabel(annotationOption)).toContain('en:word');
		expect(optionTitle(annotationOption)).toBe('en:word:description');
		expect(optionLabel(metadataOption)).toContain('en:author');
		expect(toValue(tokenSequence.selectorDisplayName)).toBe('en:results.table.property');
		expect(toValue(tokenSequence.selectorPlaceholder)).toBe('en:results.table.property');

		locale.value = 'nl';

		expect(optionLabel(annotationOption)).toContain('nl:word');
		expect(optionTitle(annotationOption)).toBe('nl:word:description');
		expect(optionLabel(metadataOption)).toContain('nl:author');
		expect(toValue(tokenSequence.selectorDisplayName)).toBe('nl:results.table.property');
		expect(toValue(tokenSequence.selectorPlaceholder)).toBe('nl:results.table.property');
	});

	test('reactively renders deferred Explore labels without replacing runtime state', async () => {
		const { annotationOptions, locale, runtime, system } = createLocalizedSearchSystem();
		runtime.state.state.value[ids.queryField('simple')] = { value: 'ship', caseSensitive: false };
		const stateBeforeLocaleChange = { ...(runtime.state.state.value[ids.queryField('simple')] as { value: string; caseSensitive: boolean }) };
		const picker = mount(SelectPicker, {
			props: { allowHtml: true, hideEmpty: true, modelValue: 'word', options: annotationOptions },
		});
		expect(picker.get('.menu-button').text()).toContain('en:word');

		locale.value = 'nl';
		await nextTick();

		expect(picker.get('.menu-button').text()).toContain('nl:word');
		expect(system.runtime.value).toBe(runtime);
		expect(runtime.state.state.value[ids.queryField('simple')]).toEqual(stateBeforeLocaleChange);
	});

	test('adds and removes debug IDs without replacing runtime state', async () => {
		const { annotationOption, annotationOptions, metadataOption, runtime, system } = createLocalizedSearchSystem();
		runtime.state.state.value[ids.queryField('simple')] = { value: 'ship', caseSensitive: false };
		const stateBeforeDebugChange = { ...(runtime.state.state.value[ids.queryField('simple')] as { value: string; caseSensitive: boolean }) };
		const picker = mount(SelectPicker, {
			props: { allowHtml: true, hideEmpty: true, modelValue: 'word', options: annotationOptions },
		});
		expect(optionLabel(annotationOption)).not.toContain('[id: word]');
		expect(optionLabel(metadataOption)).not.toContain('[id: author]');

		debug.value = true;
		await nextTick();
		expect(system.runtime.value).toBe(runtime);
		expect(optionLabel(annotationOption)).toContain('[id: word]');
		expect(optionLabel(metadataOption)).toContain('[id: author]');
		expect(picker.get('.menu-button').text()).toContain('[id: word]');
		expect(runtime.state.state.value[ids.queryField('simple')]).toEqual(stateBeforeDebugChange);

		debug.value = false;
		await nextTick();
		expect(optionLabel(annotationOption)).not.toContain('[id: word]');
		expect(optionLabel(metadataOption)).not.toContain('[id: author]');
		expect(picker.get('.menu-button').text()).not.toContain('[id: word]');
		expect(system.runtime.value).toBe(runtime);
		expect(runtime.state.state.value[ids.queryField('simple')]).toEqual(stateBeforeDebugChange);
	});

	test('resolves deferred locale labels in Explore summaries', () => {
		const { locale, runtime } = createLocalizedSearchSystem();
		expect(runtime.compile(ids.exploreForm('ngram')).summaries).toContainEqual(expect.objectContaining({ label: 'en:explore.ngram.ngramType', value: 'en:word' }));
		expect(runtime.compile(ids.exploreForm('frequency')).summaries).toContainEqual(expect.objectContaining({ label: 'en:explore.frequency.frequencyType', value: 'en:word' }));

		locale.value = 'nl';

		expect(runtime.compile(ids.exploreForm('ngram')).summaries).toContainEqual(expect.objectContaining({ label: 'nl:explore.ngram.ngramType', value: 'nl:word' }));
		expect(runtime.compile(ids.exploreForm('frequency')).summaries).toContainEqual(expect.objectContaining({ label: 'nl:explore.frequency.frequencyType', value: 'nl:word' }));
	});

	test('builds Documents as a form with configuration-backed defaults, shared filters, and a result preset', () => {
		const runtime = createDefinition();
		const groupByFieldId = ids.exploreCorporaGroupBy();
		const groupDisplayModeFieldId = ids.exploreCorporaGroupDisplayMode();

		expect(runtime.definition.getForm(ids.exploreForm('corpora'))).not.toBeNull();
		expect(runtime.state.state.value[groupByFieldId]).toBe('field:author');
		expect(runtime.state.state.value[groupDisplayModeFieldId]).toBe('table');

		runtime.state.state.value[groupDisplayModeFieldId] = 'tokens';
		runtime.state.state.value[ids.metadataFilter('genre')] = ['fiction'];
		expect(runtime.compile(ids.exploreForm('corpora'))).toMatchObject({
			encoded: {
				'f.form': ids.exploreForm('corpora'),
				'f.explore-corpora-group-display-mode': 'tokens',
			},
			filter: 'genre:(fiction)',
			patt: null,
			resultPreset: {
				groupBy: ['field:author'],
				groupDisplayMode: 'tokens',
			},
		});
	});

	test('flattens a singular metadata group instead of rendering one filter tab', () => {
		const corpus = createCorpus();
		corpus.metadataGroups = [corpus.metadataGroups[0]];
		corpus.metadataFieldGroups = [corpus.metadataFieldGroups[0]];
		const runtime = createDefinition(corpus);
		const filters = runtime.definition.getContainer(ids.sharedFilters());
		const onlyGroup = runtime.definition.getContainer(ids.filterTab('Bibliographic'));

		expect(filters?.variant).toBeUndefined();
		expect(onlyGroup?.title).toBeUndefined();
		expect(onlyGroup?.variant).toBe('list');
		expect(runtime.definition.getField(ids.metadataFilter('author'))).not.toBeNull();
	});

	test('uses tagset labels for POS field configuration', () => {
		const { field } = createLocalizedPosSystem();
		expect(toValue(field.displayName)).toBe('en:pos');
		expect(toValue(field.description)).toBe('en:pos description');
		expect(optionText(field.subAnnotationLabels.number)).toBe('en:Grammatical number');
	});

	test('resolves live tagset labels in POS field and form summaries', () => {
		const { field, fieldId, locale, runtime, selection } = createLocalizedPosSystem();
		expect(summarizeAnnotationPosState(field, selection)).toBe('Noun; en:Grammatical number: Singular');

		runtime.state.state.value[fieldId] = selection;
		runtime.state.uiState.value[ids.annotationTabs()] = ids.annotationTab('Grammar');
		runtime.state.uiState.value[ids.annotationTab('Grammar')] = fieldId;
		expect(runtime.compile(ids.searchForm('extended')).summaries).toContainEqual(expect.objectContaining({ label: 'en:pos' }));

		locale.value = 'nl';

		expect(toValue(field.displayName)).toBe('nl:pos');
		expect(toValue(field.description)).toBe('nl:pos description');
		expect(optionText(field.subAnnotationLabels.number)).toBe('nl:Grammatical number');
		expect(summarizeAnnotationPosState(field, selection)).toBe('Noun; nl:Grammatical number: Singular');
		expect(runtime.compile(ids.searchForm('extended')).summaries).toContainEqual(expect.objectContaining({ label: 'nl:pos' }));
	});

	test('keeps POS runtime state intact when tagset labels change locale', async () => {
		const { fieldId, locale, runtime, selection, system } = createLocalizedPosSystem();
		runtime.state.state.value[fieldId] = selection;
		const stateBeforeLocaleChange = { number: [...selection.number], pos: [...selection.pos] };

		locale.value = 'nl';
		await nextTick();

		expect(system.runtime.value).toBe(runtime);
		expect(runtime.state.state.value[fieldId]).toEqual(stateBeforeLocaleChange);
	});

	test('applies metadata visibility customization and falls back from a hidden configured default', () => {
		vi.spyOn(customizationRegistry.legacyApi.value!.search.metadata, 'showField').mockImplementation(id => id !== 'author');
		const runtime = createDefinition();
		const field = runtime.definition.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options };

		expect(runtime.definition.getField(ids.metadataFilter('author'))).toBeNull();
		expect(optionValues(field.options)).toEqual(['field:genre']);
		expect(runtime.state.state.value[ids.exploreCorporaGroupBy()]).toBe('field:genre');
	});

	test('restores a scoped Documents URL through the shared form restore path', () => {
		const runtime = createDefinition();
		const restored = restoreFormState(runtime.definition, {
			'f.form': ids.exploreForm('corpora'),
			'f.explore-corpora-group-by': 'field:genre',
			'f.explore-corpora-group-display-mode': 'docs',
			filter: 'author:Austen',
		});
		runtime.state.replaceState(restored);

		expect(restored.submittedFormId).toBe(ids.exploreForm('corpora'));
		expect(runtime.state.state.value[ids.exploreCorporaGroupBy()]).toBe('field:genre');
		expect(runtime.state.state.value[ids.exploreCorporaGroupDisplayMode()]).toBe('docs');
		expect(runtime.compile(ids.exploreForm('corpora'))).toMatchObject({
			filter: 'author:Austen',
			resultPreset: {
				groupBy: ['field:genre'],
				groupDisplayMode: 'docs',
			},
		});
	});

	test('builds Frequency with configured annotations, shared filters, and a hits result preset', () => {
		const runtime = createDefinition();
		const annotationFieldId = ids.exploreFrequencyAnnotation();

		expect(runtime.definition.getForm(ids.exploreForm('frequency'))).not.toBeNull();
		expect(runtime.state.state.value[annotationFieldId]).toBe('word');

		runtime.state.state.value[annotationFieldId] = 'lemma';
		runtime.state.state.value[ids.metadataFilter('genre')] = ['fiction'];
		expect(runtime.compile(ids.exploreForm('frequency'))).toMatchObject({
			encoded: {
				'f.form': ids.exploreForm('frequency'),
				'f.explore-frequency-annotation': 'lemma',
			},
			filter: 'genre:(fiction)',
			patt: '[]',
			resultPreset: {
				groupBy: ['hit:lemma'],
				viewedResults: 'hits',
			},
		});
	});

	test('falls back to the first configured Explore annotation when stored defaults are unavailable', () => {
		const state = UIStore.getState();
		state.explore.searchAnnotationIds = ['lemma'];
		state.explore.defaultSearchAnnotationId = 'removed';
		state.results.shared.groupAnnotationIds = ['pos'];
		state.explore.defaultGroupAnnotationId = 'removed';
		const runtime = createDefinition();

		expect(runtime.state.state.value[ids.exploreFrequencyAnnotation()]).toBe('pos');
		expect(runtime.state.state.value[ids.exploreNgramGroupBy()]).toBe('pos');
		expect(runtime.state.state.value[ids.exploreNgramTokens()]).toEqual(Array.from({ length: 5 }, () => ({ fieldId: 'lemma', fieldState: { value: '', caseSensitive: false } })));
	});

	test('builds a bounded N-gram sequence with independently selected token and grouping annotations', () => {
		const runtime = createDefinition();
		const tokensFieldId = ids.exploreNgramTokens();
		const groupByFieldId = ids.exploreNgramGroupBy();

		expect(runtime.definition.getForm(ids.exploreForm('ngram'))).not.toBeNull();
		expect(runtime.state.state.value[tokensFieldId] as TokenSequenceFieldState).toHaveLength(5);

		runtime.state.state.value[tokensFieldId] = [
			{ fieldId: 'word', fieldState: { value: 'wat*', caseSensitive: false } },
			{ fieldId: 'pos', fieldState: ['NOU', 'VRB'] },
			{ fieldId: 'lemma', fieldState: { value: '', caseSensitive: false } },
		] satisfies TokenSequenceFieldState;
		runtime.state.state.value[groupByFieldId] = 'lemma';
		runtime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };

		expect(runtime.compile(ids.exploreForm('ngram'))).toMatchObject({
			encoded: {
				'f.form': ids.exploreForm('ngram'),
				'f.explore-ngram-group-by': 'lemma',
			},
			filter: 'author:(Austen)',
			patt: '[word="wat.*"] [pos="NOU|VRB"] []',
			resultPreset: {
				groupBy: ['hit:lemma'],
				viewedResults: 'hits',
			},
		});
		expect(runtime.compile(ids.exploreForm('ngram')).summaries).toEqual(
			expect.arrayContaining([expect.objectContaining({ summaryType: ['patt'], value: 'lemma' }), expect.objectContaining({ summaryType: ['patt'], value: '3' })]),
		);
	});

	test('drops a restored N-gram grouping annotation that is no longer configured', () => {
		const runtime = createDefinition();
		const restored = restoreFormState(runtime.definition, {
			'f.form': ids.exploreForm('ngram'),
			'f.explore-ngram-group-by': 'removed',
		});

		expect(restored.state[ids.exploreNgramGroupBy()]).toBe('word');
		expect(restored.issues).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: ids.exploreNgramGroupBy() })]));
	});

	test('renders the N-gram length bounds and five active token editors', () => {
		const runtime = createDefinition();
		const wrapper = mount(FormSystem, {
			props: {
				rootId: ids.exploreForm('ngram'),
				runtime,
			},
		});
		const length = wrapper.get('.blf-token-sequence-field input[type="number"]');

		expect(length.attributes()).toMatchObject({ min: '1', max: '5', step: '1' });
		expect(wrapper.findAll('.blf-token-sequence-token')).toHaveLength(5);
	});

	test('uses the regular missing-tagset fallback when a POS annotation is rendered in an N-gram', () => {
		const corpus = createCorpus();
		corpus.allAnnotationsMap.pos.uiType = 'pos';
		const runtime = createDefinition(corpus);
		runtime.state.state.value[ids.exploreNgramTokens()] = [{ fieldId: 'pos', fieldState: { value: 'NOU|VRB?', caseSensitive: false } }] satisfies TokenSequenceFieldState;

		expect(runtime.compile(ids.exploreForm('ngram')).patt).toBe('[pos="NOU|VRB."]');
	});

	test.each(['ngram', 'frequency'] as const)('adds a source-only searchfield selector to parallel Explore %s', mode => {
		const runtime = createDefinition(createParallelCorpus());
		const sourceFieldId = ids.exploreParallelSource(mode);
		const sourceField = runtime.definition.getField(sourceFieldId);

		expect(runtime.state.state.value[sourceFieldId]).toBe('contents__en');
		expect(sourceField?.variant).toBe(mode === 'ngram' ? 'horizontal' : undefined);
		runtime.state.state.value[sourceFieldId] = 'contents__nl';

		const compiled = runtime.compile(ids.exploreForm(mode));
		expect(compiled.searchfield).toBe('contents__nl');
		expect(compiled.patt).not.toContain('=>');
	});

	test('restores a scoped N-gram URL including active anonymous token state', () => {
		const runtime = createDefinition();
		runtime.state.state.value[ids.exploreNgramTokens()] = [
			{ fieldId: 'lemma', fieldState: { value: 'run?', caseSensitive: false } },
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
		] satisfies TokenSequenceFieldState;
		runtime.state.state.value[ids.exploreNgramGroupBy()] = 'pos';
		const submitted = runtime.compile(ids.exploreForm('ngram'));
		const restored = restoreFormState(runtime.definition, submitted.encoded);
		runtime.state.replaceState(restored);

		expect(runtime.state.state.value[ids.exploreNgramTokens()]).toEqual([
			{ fieldId: 'lemma', fieldState: { value: 'run?', caseSensitive: false } },
			{ fieldId: 'word', fieldState: { value: '', caseSensitive: false } },
		]);
		expect(runtime.compile(ids.exploreForm('ngram'))).toMatchObject({
			patt: '[lemma="run."] []',
			resultPreset: { groupBy: ['hit:pos'], viewedResults: 'hits' },
		});
	});

	test('builds an advanced form with a configured querybuilder', () => {
		const runtime = createDefinition();
		const field = runtime.definition.getField(ids.queryField('advanced'));

		expect(runtime.definition.getForm(ids.searchForm('advanced'))).not.toBeNull();
		expect((field as unknown as { options: { defaultAnnotationId: string } }).options.defaultAnnotationId).toBe('word');
	});

	test('omits the advanced form when the legacy configuration disables it', () => {
		UIStore.getState().search.advanced.enabled = false;

		const runtime = createDefinition();

		expect(runtime.definition.getForm(ids.searchForm('advanced'))).toBeNull();
		expect(runtime.definition.getContainer(ids.searchFormsContainer())?.children.map(child => child.id)).toEqual([ids.searchForm('simple'), ids.searchForm('extended'), ids.searchForm('expert')]);
	});

	test('applies the large simple-search presentation to regular and parallel query fields', () => {
		const regularField = createDefinition().definition.getField(ids.queryField('simple'));
		const parallelField = createDefinition(createParallelCorpus()).definition.getField(ids.queryField('simple')) as unknown as {
			childFieldTemplate: { variant?: unknown };
		};

		expect(regularField?.variant).toEqual(['large', 'simple']);
		expect(parallelField.childFieldTemplate.variant).toEqual(['large', 'simple']);
	});

	test('wraps the advanced querybuilder for a parallel corpus', () => {
		const runtime = createDefinition(createParallelCorpus());
		const state = runtime.state.state.value[ids.queryField('advanced')] as ParallelFieldState;
		const sourceState = state.childStates.contents__en as CqlQueryBuilderData;
		const attribute = sourceState.tokens[0].rootAttributeGroup.entries[0];
		if ('annotationId' in attribute) attribute.values = ['water'];

		expect(runtime.definition.getField(ids.queryField('advanced'))).not.toBeNull();
		expect(runtime.definition.getField(ids.queryFieldTemplate('advanced'))).toBeNull();
		expect(runtime.compile(ids.searchForm('advanced'))).toMatchObject({
			patt: '[word="water"]',
			searchfield: 'contents__en',
		});
	});

	test('expert form combines raw CQL, within state, and shared filters', () => {
		const corpus = createCorpus();
		corpus.relations = {
			relations: {},
			spans: { s: { count: 1 } },
		};
		const state = UIStore.getState();
		state.search.shared.within.enabled = true;
		const runtime = createDefinition(corpus);

		runtime.state.state.value[ids.queryField('expert')] = '[lemma="water"]';
		runtime.state.state.value[ids.withinField()] = { element: 's', attributes: {} };
		runtime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };

		const compiled = runtime.compile(ids.searchForm('expert'));
		expect(compiled).toMatchObject({
			patt: '([lemma="water"]) within <s/>',
			filter: 'author:(Austen)',
		});
		expect(compiled.resultPreset?.withSpans).toBeUndefined();
	});

	test('configures the expert heading and raw CQL field presentation', () => {
		const runtime = createDefinition();

		const wrapper = mount(FormSystem, {
			props: {
				rootId: ids.searchForm('expert'),
				runtime,
			},
		});
		expect(wrapper.get('.blf-heading-view h3 a').attributes('href')).toBe('https://blacklab.ivdnt.org/guide/corpus-query-language.html');
		expect(wrapper.find('.blf-expert-query-field > label').exists()).toBe(false);
		expect(wrapper.get('.blf-expert-query-field textarea').attributes('aria-label')).toBe('search.expert.corpusQueryLanguage');
	});

	test('places customized within attributes and maps their generic controls', () => {
		const { personFieldId, runtime } = createCustomizedWithinRuntime();
		expect(runtime.definition.getContainer(ids.filterTab('Bibliographic'))?.children.map(node => node.id)).toEqual([personFieldId, ids.metadataFilter('author')]);
		expect(runtime.definition.getField(personFieldId)?.component).toBe(TextField);
		expect(runtime.definition.getField(ids.withinFilter('speech', 'role'))?.component).toBe(SelectField);
		expect(runtime.definition.getField(ids.withinFilter('p', 'n'))?.component).toBe(RangeField);
	});

	test('customized within attributes request span results only when populated', () => {
		const { personFieldId, runtime } = createCustomizedWithinRuntime();
		const rangeFieldId = ids.withinFilter('p', 'n');
		runtime.state.state.value[ids.queryField('expert')] = '[lemma="water"]';
		expect(runtime.compile(ids.searchForm('expert')).resultPreset?.withSpans).toBeUndefined();
		runtime.state.state.value[rangeFieldId] = { low: '  ', high: '\t', mode: 'strict' };
		expect(runtime.compile(ids.searchForm('expert')).resultPreset?.withSpans).toBeUndefined();
		runtime.state.state.value[rangeFieldId] = { low: ' 1 ', high: '', mode: 'strict' };
		expect(runtime.compile(ids.searchForm('expert'))).toMatchObject({
			patt: '([lemma="water"]) within <p n=in[1,]/>',
			resultPreset: { withSpans: true },
		});
		runtime.state.state.value[rangeFieldId] = { low: '', high: '', mode: 'strict' };
		runtime.state.state.value[personFieldId] = { value: 'Alice*', caseSensitive: false };
		expect(runtime.compile(ids.searchForm('expert')).resultPreset).toMatchObject({ withSpans: true });
	});

	test('compiles, persists, and summarizes a customized within attribute', () => {
		const { personFieldId, runtime } = createCustomizedWithinRuntime();
		runtime.state.state.value[ids.queryField('expert')] = '[lemma="water"]';
		runtime.state.state.value[personFieldId] = { value: 'Alice*', caseSensitive: false };
		const compiled = runtime.compile(ids.searchForm('expert'));

		expect(compiled).toMatchObject({
			patt: '([lemma="water"]) within <speech person="Alice.*"/>',
			encoded: {
				'f.within:speech:person': 'Alice*',
			},
		});
		expect(compiled.summaries).toContainEqual({ label: 'Speaker', value: 'Alice*', group: 'Bibliographic', summaryType: ['filter'] });
	});

	test('adapts old span-filter definitions through the internal customization API', () => {
		const corpus = createCorpus();
		const registry = createCustomizationRegistry(corpus);
		registry.legacyApi.value!.search.metadata._customTabs.push({
			name: 'Span filters',
			fields: [
				{
					id: 'span:speech:role',
					componentName: 'filter-select',
					behaviourName: 'span-select',
					defaultDisplayName: 'Role',
					metadata: { options: ['host', 'guest'] },
				},
			],
		});
		const customizations = createCustomizations(registry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);

		expect(customizations.searchFormSpanFilters()).toMatchObject([
			{
				id: 'span:speech:role',
				elementName: 'speech',
				attributeName: 'role',
				control: { type: 'select', options: [{ value: 'host' }, { value: 'guest' }] },
			},
		]);
	});

	test('restores a canonical raw query into the expert form', () => {
		const runtime = createDefinition();
		const restored = restoreFormState(runtime.definition, {
			patt: '[lemma="water"]',
		});
		runtime.state.replaceState(restored);

		expect(restored.issues).toEqual([]);
		expect(runtime.state.state.value[ids.queryField('expert')]).toBe('[lemma="water"]');
		expect(runtime.compile(ids.searchForm('expert')).patt).toBe('[lemma="water"]');
	});

	test('wraps the expert query for a parallel corpus', () => {
		const runtime = createDefinition(createParallelCorpus());
		const state = runtime.state.state.value[ids.queryField('expert')] as ParallelFieldState;

		expect(runtime.definition.getField(ids.queryField('expert'))).not.toBeNull();
		expect(runtime.definition.getField(ids.queryFieldTemplate('expert'))).toBeNull();
		state.childStates.contents__en = '[lemma="water"]';
		state.targets = ['contents__nl'];
		state.childStates.contents__nl = '[lemma="water"]';
		expect(runtime.compile(ids.searchForm('expert'))).toMatchObject({
			patt: '[lemma="water"] ==>nl? [lemma="water"]',
			searchfield: 'contents__en',
		});
	});

	test('extended form compiles annotation fields with shared filters', () => {
		const definition = createDefinition();

		definition.state.state.value[ids.annotationField('extended', 'contents', 'word')] = {
			value: 'water',
			caseSensitive: false,
		};
		definition.state.state.value[ids.metadataFilter('author')] = {
			value: 'Austen',
			caseSensitive: false,
		};
		definition.state.state.value[ids.metadataFilter('genre')] = ['fiction'];

		const compiled = definition.compile(ids.searchForm('extended'));

		expect(compiled.patt).toBe('[word="water"]');
		expect(compiled.filter).toBe('(author:(Austen) AND genre:(fiction))');
		expect(compiled.summaries).toEqual([
			{ group: 'Basics', label: 'word', value: 'water', summaryType: ['patt'] },
			{ group: 'Bibliographic', label: 'author', value: 'Austen', summaryType: ['filter'] },
			{ group: 'Classification', label: 'genre', value: 'Fiction', summaryType: ['filter'] },
		]);
	});

	test('simple form excludes configured shared filters', () => {
		const definition = createDefinition();

		definition.state.state.value[ids.queryField('simple')] = {
			value: 'water',
			caseSensitive: false,
		};
		definition.state.state.value[ids.metadataFilter('author')] = {
			value: 'Austen',
			caseSensitive: false,
		};

		expect(definition.compile(ids.searchForm('simple'))).toMatchObject({
			filter: null,
			patt: '[word="water"]',
		});
	});

	test('replaces the runtime and definition when legacy configuration changes', () => {
		const state = UIStore.getState();
		const system = createLegacyBackedSearchSystem();
		const initialRuntime = system.runtime.value!;
		const initialDefinition = initialRuntime.definition;

		state.search.simple.searchAnnotationId = 'lemma';

		expect(system.runtime.value).not.toBe(initialRuntime);
		expect(system.runtime.value!.definition).not.toBe(initialDefinition);
	});

	test('runs modern graph customization after applying legacy configuration', () => {
		UIStore.getState().search.simple.searchAnnotationId = 'lemma';
		const observedAnnotations: string[] = [];
		const customFormId = 'custom/search-form';
		const customContainerId = 'custom/search-form/fields';
		const customFieldId = 'custom/search-form/lemma';
		let registered = true;
		const unregister = customizationRegistry.registerForm({
			customize(form) {
				const id = form.ids.queryField('simple');
				observedAnnotations.push(`${form.corpus.id}:${(form.graph.getField(id) as unknown as { annotationId: string }).annotationId}`);
				expect(form).not.toHaveProperty('setAnnotationUiType');
				form.graph.replaceNode(id, form.annotationSelect('lemma', { id, options: [{ value: 'run' }] }));
				const fields = form.newContainer(customContainerId, { variant: 'list' }).addChildren(form.annotationText('lemma', { id: customFieldId }));
				const customForm = form.newForm(customFormId, { title: () => form.translate.$t('search.simple.heading') }).addChildren(fields);
				form.graph.getContainer(form.ids.searchFormsContainer())!.addChildren(customForm);
			},
		});

		try {
			const system = createLegacyBackedSearchSystem();
			const customizedRuntime = system.runtime.value!;
			expect(observedAnnotations).toEqual(['test-corpus:lemma']);
			expect(customizedRuntime.definition.getField(ids.queryField('simple'))?.component).toBe(SelectField);
			expect(customizedRuntime.definition.getForm(customFormId)).not.toBeNull();
			expect(customizedRuntime.definition.getContainer(customContainerId)?.children.map(node => node.id)).toEqual([customFieldId]);

			unregister();
			registered = false;
			expect(system.runtime.value).not.toBe(customizedRuntime);
			expect(system.runtime.value!.definition.getField(ids.queryField('simple'))?.component).toBe(TextField);
			expect(system.runtime.value!.definition.getForm(customFormId)).toBeNull();
		} finally {
			if (registered) unregister();
		}
	});

	test('treats callback shorthand as semantic configuration', () => {
		const unregister = customizationRegistry.registerForm(form => form.setSimpleAnnotation('lemma'));

		try {
			const definition = createLegacyBackedSearchSystem().runtime.value!.definition;
			expect((definition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
		} finally {
			unregister();
		}
	});

	test('continues each customization phase after a callback error', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let graphCustomizations = 0;
		const unregisterFailing = customizationRegistry.registerForm({
			configure() {
				throw new Error('configuration failed');
			},
			customize() {
				throw new Error('graph customization failed');
			},
		});
		const unregisterFollowing = customizationRegistry.registerForm({
			configure(form) {
				form.setSimpleAnnotation('lemma');
			},
			customize() {
				graphCustomizations += 1;
			},
		});

		try {
			const definition = createLegacyBackedSearchSystem().runtime.value!.definition;
			expect((definition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
			expect(graphCustomizations).toBe(1);
			expect(error).toHaveBeenCalledTimes(2);
			expect(error.mock.calls.map(([message]) => message)).toEqual(['Error in search form configuration callback:', 'Error in search form graph customization callback:']);
		} finally {
			unregisterFailing();
			unregisterFollowing();
		}
	});

	test('uses returned span-filter IDs for ordering and replaces filters in place', () => {
		const unregister = customizationRegistry.registerForm(form => {
			const roleId = form.addSpanFilter({ elementName: 'speech', attributeName: 'role', control: 'text', groupId: 'Classification' });
			form.addSpanFilter({ elementName: 'speech', attributeName: 'speaker', control: 'text', groupId: 'Classification', insertBefore: roleId });
			form.addSpanFilter({ elementName: 'speech', attributeName: 'role', control: 'range', groupId: 'Classification' });
		});

		try {
			const definition = createLegacyBackedSearchSystem().runtime.value!.definition;
			expect(definition.getContainer(ids.filterTab('Classification'))?.children.map(node => node.id)).toEqual([
				ids.metadataFilter('genre'),
				ids.withinFilter('speech', 'speaker'),
				ids.withinFilter('speech', 'role'),
			]);
			expect(definition.getField(ids.withinFilter('speech', 'role'))?.component).toBe(RangeField);
		} finally {
			unregister();
		}
	});

	test('evaluates metadata visibility once per corpus field and rebuilds after unregistering', () => {
		vi.spyOn(customizationRegistry.legacyApi.value!.search.metadata, 'showField').mockImplementation(id => id !== 'genre');
		const visited: string[] = [];
		const unregister = customizationRegistry.registerForm(form => {
			form.filterMetadataFields(field => {
				visited.push(field.id);
				return field.id !== 'author';
			});
		});

		try {
			const system = createLegacyBackedSearchSystem();
			const exploreGroupBy = system.runtime.value!.definition.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options };
			expect(visited).toEqual(['author', 'genre']);
			expect(system.runtime.value!.definition.getField(ids.metadataFilter('author'))).toBeNull();
			expect(system.runtime.value!.definition.getField(ids.metadataFilter('genre'))).not.toBeNull();
			expect(optionValues(exploreGroupBy.options)).toEqual(['field:genre']);

			unregister();
			const rebuilt = system.runtime.value!.definition;
			expect(rebuilt.getField(ids.metadataFilter('author'))).not.toBeNull();
			expect(rebuilt.getField(ids.metadataFilter('genre'))).toBeNull();
			expect(optionValues((rebuilt.getField(ids.exploreCorporaGroupBy()) as unknown as { options: Options }).options)).toEqual(['field:author']);
		} finally {
			unregister();
		}
	});

	test('applies modern semantic configuration before constructing built-in and custom fields', () => {
		const corpus = createCorpus();
		corpus.allAnnotationsMap.lemma.hasForwardIndex = false;
		corpus.relations.spans = {
			speech: {
				count: 2,
				attributes: {
					role: { valueListComplete: true, values: { guest: 1, host: 1 } },
				},
			},
		};
		let spanFilterNodeId = '';
		const unregister = customizationRegistry.registerForm({
			configure(form) {
				form.setSimpleAnnotation('lemma');
				form.setExtendedAnnotations(['pos']);
				form.setAnnotationControl('lemma', 'autocomplete');
				form.configureAdvanced({ annotationIds: ['lemma'], defaultAnnotationId: 'lemma' });
				form.filterMetadataFields(field => field.id !== 'author');
				form.setMetadataFilters(['author', 'genre']);
				form.configureWithin({ enabled: false });
				form.configureExplore({
					searchAnnotationIds: ['lemma'],
					defaultSearchAnnotationId: 'lemma',
					groupAnnotationIds: ['lemma', 'pos'],
					defaultGroupAnnotationId: 'lemma',
					corpora: { groupMetadataIds: ['author', 'genre'], defaultGroupMetadataId: 'genre' },
				});
				spanFilterNodeId = form.addSpanFilter({ elementName: 'speech', attributeName: 'role', groupId: 'Classification' });
			},
			customize(form) {
				const range = form.metadataMultiFieldRange({ id: 'year-range', defaultDisplayName: 'Year' }, { id: 'year-range', fromField: 'year_from', toField: 'year_to', inputType: 'number' });
				form.graph.getContainer(form.ids.filterTab('Classification'))!.insertBefore(range, form.ids.metadataFilter('genre'));
			},
		});

		try {
			const system = createScopedSearchFormSystem({
				blacklabApi: createMockApi().blacklabApi,
				corpus: ref(corpus),
				tagset: ref(undefined),
				translate: createMockTranslate(),
			});
			const runtime = system.runtime.value!;
			const definition = runtime.definition;
			const queryBuilderState = runtime.state.state.value[ids.queryField('advanced')] as CqlQueryBuilderData;
			const queryBuilderAttribute = queryBuilderState.tokens[0].rootAttributeGroup.entries[0];

			expect((definition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
			expect((definition.getField(ids.queryField('simple')) as unknown as { autocomplete?: unknown }).autocomplete).toBeTypeOf('function');
			expect(definition.getField(ids.annotationField('extended', 'contents', 'word'))).toBeNull();
			expect(definition.getField(ids.annotationField('extended', 'contents', 'pos'))).not.toBeNull();
			expect('annotationId' in queryBuilderAttribute ? queryBuilderAttribute.annotationId : null).toBe('lemma');
			expect(definition.getField(ids.metadataFilter('author'))).toBeNull();
			expect(definition.getField(ids.metadataFilter('genre'))).not.toBeNull();
			expect(definition.getField(ids.withinField())).toBeNull();
			expect(definition.getField(ids.withinFilter('speech', 'role'))?.component).toBe(SelectField);
			expect(spanFilterNodeId).toBe(ids.withinFilter('speech', 'role'));
			expect(definition.getField('year-range')?.component).toBe(RangeField);
			expect(definition.getContainer(ids.filterTab('Classification'))?.children.map(node => node.id)).toEqual(['year-range', ids.metadataFilter('genre'), ids.withinFilter('speech', 'role')]);
			expect((definition.getField(ids.exploreNgramTokens()) as unknown as { defaultFieldId: string }).defaultFieldId).toBe('lemma');
			expect((definition.getField(ids.exploreNgramGroupBy()) as unknown as { defaultAnnotationId: string }).defaultAnnotationId).toBe('pos');
			expect((definition.getField(ids.exploreCorporaGroupBy()) as unknown as { defaultValue: string }).defaultValue).toBe('field:genre');
		} finally {
			unregister();
		}
	});

	test('normalizes legacy annotation widget overrides before building the form', () => {
		const corpus = createCorpus();
		corpus.allAnnotationsMap.lemma.values = [{ value: 'run', label: 'Run', title: null }];
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'uiType').mockImplementation((_field, annotationId) => (annotationId === 'lemma' ? ('dropdown' as 'select') : null));

		UIStore.init({ index: corpus } as CorpusContext);

		expect(corpus.allAnnotationsMap.lemma.uiType).toBe('text');
		expect(createDefinition(corpus).definition.getField(ids.annotationField('extended', 'contents', 'lemma'))?.component).toBe(SelectField);
		expect(corpus.allAnnotationsMap.lemma.uiType).toBe('select');
	});

	test('builds replacement search fields from the latest legacy configuration', () => {
		const state = UIStore.getState();
		const system = createLegacyBackedSearchSystem();

		state.search.simple.searchAnnotationId = 'lemma';
		state.search.extended.searchAnnotationIds = ['pos'];
		state.search.advanced.searchAnnotationIds = ['lemma'];
		state.search.advanced.defaultSearchAnnotationId = 'lemma';
		state.search.shared.searchMetadataIds = ['genre'];

		const configuredDefinition = system.runtime.value!.definition;
		expect((configuredDefinition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
		expect(configuredDefinition.getField(ids.annotationField('extended', 'contents', 'word'))).toBeNull();
		expect(configuredDefinition.getField(ids.annotationField('extended', 'contents', 'pos'))).not.toBeNull();
		expect((configuredDefinition.getField(ids.queryField('advanced')) as unknown as { options: { defaultAnnotationId: string } }).options.defaultAnnotationId).toBe('lemma');
		expect(configuredDefinition.getField(ids.metadataFilter('author'))).toBeNull();
		expect(configuredDefinition.getField(ids.metadataFilter('genre'))).not.toBeNull();
	});

	test('creates querybuilder defaults from the replacement legacy configuration', () => {
		const state = UIStore.getState();
		const system = createLegacyBackedSearchSystem();

		state.search.advanced.searchAnnotationIds = ['lemma'];
		state.search.advanced.defaultSearchAnnotationId = 'lemma';

		const configuredRuntime = system.runtime.value!;
		const queryBuilderState = configuredRuntime.state.state.value[ids.queryField('advanced')] as CqlQueryBuilderData;
		const defaultAttribute = queryBuilderState.tokens[0].rootAttributeGroup.entries[0];
		expect('annotationId' in defaultAttribute ? defaultAttribute.annotationId : null).toBe('lemma');
		expect(configuredRuntime.compile(ids.searchForm('advanced')).patt).toBeNull();
	});

	test('replacement runtimes do not inherit or write through to prior draft state', () => {
		const state = UIStore.getState();
		const system = createLegacyBackedSearchSystem();
		const initialRuntime = system.runtime.value!;
		initialRuntime.state.state.value[ids.queryField('simple')] = { value: 'water', caseSensitive: false };
		initialRuntime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };

		state.search.simple.searchAnnotationId = 'lemma';

		const replacementRuntime = system.runtime.value!;
		expect(replacementRuntime.state.state.value[ids.queryField('simple')]).toEqual({ value: '', caseSensitive: false });
		expect(replacementRuntime.state.state.value[ids.metadataFilter('author')]).toEqual({ value: '', caseSensitive: false });

		replacementRuntime.state.state.value[ids.queryField('simple')] = { value: 'fire', caseSensitive: false };
		replacementRuntime.state.state.value[ids.metadataFilter('author')] = { value: 'Bronte', caseSensitive: false };
		expect(initialRuntime.state.state.value[ids.queryField('simple')]).toEqual({ value: 'water', caseSensitive: false });
		expect(initialRuntime.state.state.value[ids.metadataFilter('author')]).toEqual({ value: 'Austen', caseSensitive: false });
	});

	test('creates parallel querybuilder defaults from the replacement definition', () => {
		const system = createScopedSearchFormSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus: ref(createParallelCorpus()),
			tagset: ref(undefined),
			translate: createMockTranslate(),
		});

		UIStore.getState().search.advanced.searchAnnotationIds = ['lemma'];
		UIStore.getState().search.advanced.defaultSearchAnnotationId = 'lemma';

		const replacementState = system.runtime.value!.state.state.value[ids.queryField('advanced')] as ParallelFieldState;
		const replacementSourceState = replacementState.childStates.contents__en as CqlQueryBuilderData;
		const defaultAttribute = replacementSourceState.tokens[0].rootAttributeGroup.entries[0];
		expect('annotationId' in defaultAttribute ? defaultAttribute.annotationId : null).toBe('lemma');
		expect(system.runtime.value!.compile(ids.searchForm('advanced')).patt).toBeNull();
	});

	test('discards draft state and restores the URL against the replacement definition', () => {
		const system = createScopedSearchFormSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus: ref(createCorpus()),
			tagset: ref(undefined),
			translate: createMockTranslate(),
		});
		const initialRuntime = system.runtime.value!;
		initialRuntime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };
		const queryBuilderState = initialRuntime.state.state.value[ids.queryField('advanced')] as CqlQueryBuilderData;
		const queryBuilderAttribute = queryBuilderState.tokens[0].rootAttributeGroup.entries[0];
		if (!('annotationId' in queryBuilderAttribute)) throw new Error('Expected the default querybuilder attribute.');
		queryBuilderAttribute.values = ['water'];
		const committedUrlState = initialRuntime.compile(ids.searchForm('advanced'));

		queryBuilderAttribute.values = ['fire'];
		initialRuntime.state.state.value[ids.metadataFilter('author')] = { value: 'Bronte', caseSensitive: false };
		initialRuntime.state.state.value[ids.queryField('simple')] = { value: 'draft', caseSensitive: false };

		UIStore.getState().search.advanced.searchAnnotationIds = ['lemma'];
		UIStore.getState().search.advanced.defaultSearchAnnotationId = 'word';

		const replacementRuntime = system.runtime.value!;
		expect(replacementRuntime).not.toBe(initialRuntime);

		const restored = restoreFormState(replacementRuntime.definition, {
			...committedUrlState.encoded,
			patt: committedUrlState.patt,
			filter: committedUrlState.filter,
		});
		replacementRuntime.state.replaceState(restored);

		expect(restored.issues).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'query', nodeId: ids.queryField('advanced') })]));
		expect(restored.rawOverrides).toEqual({ patt: committedUrlState.patt });
		expect(replacementRuntime.state.state.value[ids.metadataFilter('author')]).toEqual({ value: 'Austen', caseSensitive: false });
		expect(replacementRuntime.compile(ids.searchForm('advanced'))).toMatchObject({
			patt: committedUrlState.patt,
			filter: committedUrlState.filter,
		});
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

		const within = createDefinition(corpus).definition.getField(ids.withinField()) as unknown as {
			options: Array<{ value: string; label?: OptionText; title?: OptionText | null }>;
		};

		expect(within.options.map(option => option.value)).toEqual(['', 'p', 's']);
		expect(within.options.map(optionLabel)).toEqual(['', 'Custom paragraph', 'Custom sentence']);
		expect(within.options.map(option => optionText(option.title))).toEqual([undefined, 'Paragraph title', null]);
	});

	test('normalizes legacy within visibility hooks through the customization adapter', () => {
		const corpus = createCorpus();
		corpus.relations = {
			relations: {},
			spans: {
				p: { count: 1 },
				s: {
					count: 1,
					attributes: {
						role: { valueListComplete: true, values: { narrator: 1 } },
						speaker: { valueListComplete: true, values: { Alice: 1 } },
					},
				},
			},
		};
		UIStore.getState().search.shared.within.enabled = true;
		vi.spyOn(customizationRegistry.legacyApi.value!.search.within, 'includeSpan').mockImplementation(element => (element === 'p' ? false : null));
		vi.spyOn(customizationRegistry.legacyApi.value!.search.within, 'includeAttribute').mockImplementation((_element, attribute) => (attribute === 'speaker' ? true : null));

		const within = createDefinition(corpus).definition.getField(ids.withinField()) as unknown as {
			options: Array<{ value: string; attributes: Array<{ value: string; label?: OptionText }> }>;
		};

		expect(within.options.map(option => option.value)).toEqual(['', 's']);
		expect(within.options[1].attributes.map(option => option.value)).toEqual(['speaker']);
		expect(within.options[1].attributes.map(optionLabel)).toEqual(['s speaker']);
	});

	test('uses the configured align-by visibility, options, and default', () => {
		const state = UIStore.getState();
		state.search.shared.alignBy.elements = [
			{ value: 'sentence-alignment', label: 'By sentence', title: 'Sentence alignment' },
			{ value: 'word-alignment', label: 'By word', title: null },
		];
		state.search.shared.alignBy.defaultValue = 'sentence-alignment';

		const hiddenDefinition = createDefinition(createParallelCorpus());
		const hiddenField = hiddenDefinition.definition.getField(ids.queryField('simple')) as unknown as { alignByOptions: unknown[] };
		expect(hiddenField.alignByOptions).toEqual([]);
		expect((hiddenDefinition.state.state.value[ids.queryField('simple')] as { alignBy: string | null }).alignBy).toBe('sentence-alignment');

		state.search.shared.alignBy.enabled = true;
		const visibleDefinition = createDefinition(createParallelCorpus());
		const visibleField = visibleDefinition.definition.getField(ids.queryField('simple')) as unknown as {
			alignByOptions: Array<{ value: string; label?: OptionText; title?: OptionText | null }>;
		};
		expect(visibleField.alignByOptions.map(option => option.value)).toEqual(['sentence-alignment', 'word-alignment']);
		expect(visibleField.alignByOptions.map(optionLabel)).toEqual(['By sentence', 'By word']);
		expect(visibleField.alignByOptions.map(option => optionText(option.title))).toEqual(['Sentence alignment', null]);
	});

	test('mounting after a simple-search restore does not write through to within state', async () => {
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
		const restored = restoreFormState(definition.definition, {
			'f.form': ids.searchForm('simple'),
			'f.word': 'schip',
			patt: '[word_or_lemma="(?i)schip"]',
		});
		definition.state.replaceState(restored);
		const currentWithinState = definition.state.state.value[ids.withinField()] as { element: string | null; attributes: Record<string, string> };
		const withinStateBeforeMount = { element: currentWithinState.element, attributes: { ...currentWithinState.attributes } };
		expect(withinStateBeforeMount).toEqual({ element: null, attributes: {} });

		mount(FormSystem, {
			props: {
				runtime: definition,
				rootId: ids.searchForm('extended'),
			},
		});
		await nextTick();

		expect(definition.state.state.value[ids.withinField()]).toEqual(withinStateBeforeMount);
	});

	test('restores the extended annotation value from scoped URL state', () => {
		const state = UIStore.getState();
		state.search.extended.searchAnnotationIds = ['word_or_lemma', 'pos'];
		const definition = createDefinition();
		const restored = restoreFormState(definition.definition, {
			'f.form': ids.searchForm('extended'),
			'f.word_or_lemma': 'schip',
			patt: '[word_or_lemma="(?i)schip"]',
			searchfield: 'contents',
		});
		definition.state.replaceState(restored);

		expect(restored.issues).toEqual([]);
		expect(restored.submittedFormId).toBe(ids.searchForm('extended'));
		expect(definition.state.state.value[ids.annotationField('extended', 'contents', 'word_or_lemma')]).toEqual({
			value: 'schip',
			caseSensitive: false,
		});
		expect(definition.compile(ids.searchForm('extended'))).toMatchObject({
			encoded: {
				'f.form': ids.searchForm('extended'),
				'f.word_or_lemma': 'schip',
			},
			patt: '[word_or_lemma="(?i)schip"]',
			searchfield: null,
		});
	});

	test('activates the extended annotation tab that contains restored values', () => {
		const state = UIStore.getState();
		state.search.extended.searchAnnotationIds = ['word_or_lemma', 'pos'];
		const definition = createDefinition();
		const restored = restoreFormState(definition.definition, { 'f.form': ids.searchForm('extended'), 'f.pos': 'NOU' });

		expect(restored.uiState[ids.annotationTabs()]).toBe(ids.annotationTab('Grammar'));
		expect(restored.uiState[ids.annotationTab('Grammar')]).toBe(ids.annotationField('extended', 'contents', 'pos'));
	});
});
