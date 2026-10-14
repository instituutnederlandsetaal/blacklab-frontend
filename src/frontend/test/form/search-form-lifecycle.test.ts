// @vitest-environment jsdom

import { createMockApi } from '@test/mocks/api';
import { createMockTranslate } from '@test/mocks/i18n';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref, toValue } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import { normalizeTagset } from '@/features/corpus/model/tagset-state';
import type { CqlQueryBuilderData } from '@/features/cql-query-builder/model';
import { AnnotationPosField, TextField, type AnnotationPosFieldConfig, type ParallelFieldState } from '@/features/form';
import type { SummaryViewConfig } from '@/features/form/model/views/summary-view';
import type { Corpus, NormalizedAnnotation, Tagset } from '@/types/apptypes';

import { annotation, createCorpus, createParallelCorpus, createSearchFormFixture, readSearchFormState, type SearchFormFixture } from './search-form-fixture';

import debug from '@/shared/debug/debug';
import { findOption, optionLabel, optionText, optionTitle, type Options } from '@/shared/utils/options';

let fixture: SearchFormFixture;

beforeEach(() => {
	fixture = createSearchFormFixture();
});

afterEach(() => {
	fixture.scope.stop();
	vi.restoreAllMocks();
});

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
	const system = fixture.createSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus: createCorpus(),
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

	return { annotationOption, locale, metadataOption, runtime, system, tokenSequence };
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
	const system = fixture.createSystem({
		blacklabApi: createMockApi().blacklabApi,
		corpus,
		tagset: normalizedTagset,
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

describe('Search form lifecycle', () => {
	test('builds forms only for a loaded corpus and updates controls when its tagset changes', () => {
		const corpus = ref<Corpus>();
		const tagset = ref<Tagset>();
		const system = fixture.createSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus,
			tagset,
			translate: createMockTranslate(),
		});
		const configure = vi.fn();
		const unregisterPresent = fixture.registry.registerForm(configure);
		let unregisterAbsent = () => {};

		try {
			expect(system.runtime.value).toBeNull();
			expect(configure).not.toHaveBeenCalled();

			tagset.value = { values: { NOU: { value: 'NOU', displayName: 'Noun', subAnnotationIds: [] } }, subAnnotations: {} };
			expect(system.runtime.value).toBeNull();
			expect(configure).not.toHaveBeenCalled();

			const loadedCorpus = createCorpus();
			loadedCorpus.allAnnotationsMap.pos.uiType = 'pos';
			corpus.value = loadedCorpus;
			expect(system.runtime.value!.definition.getField(ids.annotationField('extended', 'contents', 'pos'))?.component).toBe(AnnotationPosField);
			expect(configure).toHaveBeenCalled();

			tagset.value = undefined;
			expect(system.runtime.value!.definition.getField(ids.annotationField('extended', 'contents', 'pos'))?.component).toBe(TextField);

			unregisterPresent();
			corpus.value = undefined;
			expect(system.runtime.value).toBeNull();
			configure.mockClear();
			tagset.value = { values: {}, subAnnotations: {} };
			unregisterAbsent = fixture.registry.registerForm(configure);
			expect(system.runtime.value).toBeNull();
			expect(configure).not.toHaveBeenCalled();
		} finally {
			unregisterPresent();
			unregisterAbsent();
		}
	});

	test('updates deferred Explore labels and summaries without rebuilding the form', () => {
		const { annotationOption, locale, metadataOption, runtime, system, tokenSequence } = createLocalizedSearchSystem();
		runtime.state.state.value[ids.queryField('simple')] = { value: 'ship', caseSensitive: false };
		expect(optionLabel(annotationOption)).toContain('en:word');
		expect(optionTitle(annotationOption)).toBe('en:word:description');
		expect(optionLabel(metadataOption)).toContain('en:author');
		expect(toValue(tokenSequence.selectorDisplayName)).toBe('en:results.table.property');
		expect(toValue(tokenSequence.selectorPlaceholder)).toBe('en:results.table.property');
		expect(runtime.compile(ids.exploreForm('ngram')).summaries).toContainEqual(expect.objectContaining({ label: 'en:explore.ngram.ngramType', value: 'en:word' }));
		expect(runtime.compile(ids.exploreForm('frequency')).summaries).toContainEqual(expect.objectContaining({ label: 'en:explore.frequency.frequencyType', value: 'en:word' }));

		locale.value = 'nl';

		expect(optionLabel(annotationOption)).toContain('nl:word');
		expect(optionTitle(annotationOption)).toBe('nl:word:description');
		expect(optionLabel(metadataOption)).toContain('nl:author');
		expect(toValue(tokenSequence.selectorDisplayName)).toBe('nl:results.table.property');
		expect(toValue(tokenSequence.selectorPlaceholder)).toBe('nl:results.table.property');
		expect(runtime.compile(ids.exploreForm('ngram')).summaries).toContainEqual(expect.objectContaining({ label: 'nl:explore.ngram.ngramType', value: 'nl:word' }));
		expect(runtime.compile(ids.exploreForm('frequency')).summaries).toContainEqual(expect.objectContaining({ label: 'nl:explore.frequency.frequencyType', value: 'nl:word' }));
		expect(system.runtime.value).toBe(runtime);
		expect(runtime.state.state.value[ids.queryField('simple')]).toEqual({ value: 'ship', caseSensitive: false });
	});

	test('adds and removes debug IDs without rebuilding the form', () => {
		const { annotationOption, metadataOption, runtime, system } = createLocalizedSearchSystem();
		runtime.state.state.value[ids.queryField('simple')] = { value: 'ship', caseSensitive: false };
		expect(optionLabel(annotationOption)).not.toContain('[id: word]');
		expect(optionLabel(metadataOption)).not.toContain('[id: author]');

		debug.value = true;
		expect(optionLabel(annotationOption)).toContain('[id: word]');
		expect(optionLabel(metadataOption)).toContain('[id: author]');
		expect(system.runtime.value).toBe(runtime);

		debug.value = false;
		expect(optionLabel(annotationOption)).not.toContain('[id: word]');
		expect(optionLabel(metadataOption)).not.toContain('[id: author]');
		expect(system.runtime.value).toBe(runtime);
		expect(runtime.state.state.value[ids.queryField('simple')]).toEqual({ value: 'ship', caseSensitive: false });
	});

	test('creates an independent totals controller for each summary', () => {
		const summary = fixture.createRuntime().definition.getView(ids.sharedFiltersSummary()) as unknown as SummaryViewConfig;
		const first = summary.createTotals();
		const second = summary.createTotals();

		first.update({});
		expect(toValue(first.state).status).toBe('loaded');
		expect(toValue(second.state).status).toBe('loading');

		first.dispose?.();
		second.update({});
		expect(toValue(second.state).status).toBe('loaded');
		second.dispose?.();
	});

	test('updates POS labels and summaries without rebuilding the form', () => {
		const { field, fieldId, locale, runtime, selection, system } = createLocalizedPosSystem();
		expect(toValue(field.displayName)).toBe('en:pos');
		expect(toValue(field.description)).toBe('en:pos description');
		expect(optionText(field.subAnnotationLabels.number)).toBe('en:Grammatical number');

		runtime.state.state.value[fieldId] = selection;
		runtime.state.uiState.value[ids.annotationTabs()] = ids.annotationTab('Grammar');
		runtime.state.uiState.value[ids.annotationTab('Grammar')] = fieldId;
		expect(runtime.compile(ids.searchForm('extended')).summaries).toContainEqual(expect.objectContaining({ label: 'en:pos' }));

		locale.value = 'nl';

		expect(toValue(field.displayName)).toBe('nl:pos');
		expect(toValue(field.description)).toBe('nl:pos description');
		expect(optionText(field.subAnnotationLabels.number)).toBe('nl:Grammatical number');
		expect(runtime.compile(ids.searchForm('extended')).summaries).toContainEqual(expect.objectContaining({ label: 'nl:pos' }));
		expect(system.runtime.value).toBe(runtime);
		expect(runtime.state.state.value[fieldId]).toEqual(selection);
	});

	test('builds replacement search fields from the latest legacy configuration', () => {
		const state = UIStore.getState();
		const system = fixture.createSystem();
		const initialRuntime = system.runtime.value!;

		state.search.simple.searchAnnotationId = 'lemma';
		state.search.extended.searchAnnotationIds = ['pos'];
		state.search.advanced.searchAnnotationIds = ['lemma'];
		state.search.advanced.defaultSearchAnnotationId = 'removed';
		state.search.shared.searchMetadataIds = ['genre'];

		const configuredRuntime = system.runtime.value!;
		const configuredDefinition = configuredRuntime.definition;
		expect(configuredRuntime).not.toBe(initialRuntime);
		expect((configuredDefinition.getField(ids.queryField('simple')) as unknown as { annotationId: string }).annotationId).toBe('lemma');
		expect(configuredDefinition.getField(ids.annotationField('extended', 'contents', 'word'))).toBeNull();
		expect(configuredDefinition.getField(ids.annotationField('extended', 'contents', 'pos'))).not.toBeNull();
		expect((configuredDefinition.getField(ids.queryField('advanced')) as unknown as { options: { defaultAnnotationId: string } }).options.defaultAnnotationId).toBe('lemma');
		expect(configuredDefinition.getField(ids.metadataFilter('author'))).toBeNull();
		expect(configuredDefinition.getField(ids.metadataFilter('genre'))).not.toBeNull();
		const queryBuilderState = configuredRuntime.state.state.value[ids.queryField('advanced')] as CqlQueryBuilderData;
		const defaultAttribute = queryBuilderState.tokens[0].rootAttributeGroup.entries[0];
		expect('annotationId' in defaultAttribute ? defaultAttribute.annotationId : null).toBe('lemma');
		expect(configuredRuntime.compile(ids.searchForm('advanced')).params.patt).toBeUndefined();
	});

	test('replacement runtimes do not inherit or write through to prior draft state', () => {
		const state = UIStore.getState();
		const system = fixture.createSystem();
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
		const system = fixture.createSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus: createParallelCorpus(),
			translate: createMockTranslate(),
		});
		const initialRuntime = system.runtime.value!;

		UIStore.getState().search.advanced.searchAnnotationIds = ['lemma'];
		UIStore.getState().search.advanced.defaultSearchAnnotationId = 'lemma';

		const replacementRuntime = system.runtime.value!;
		expect(replacementRuntime).not.toBe(initialRuntime);
		const replacementState = replacementRuntime.state.state.value[ids.queryField('advanced')] as ParallelFieldState;
		const replacementSourceState = replacementState.childStates.contents__en as CqlQueryBuilderData;
		const defaultAttribute = replacementSourceState.tokens[0].rootAttributeGroup.entries[0];
		expect('annotationId' in defaultAttribute ? defaultAttribute.annotationId : null).toBe('lemma');
		expect(system.runtime.value!.compile(ids.searchForm('advanced')).params.patt).toBeUndefined();
	});

	test('discards draft state and restores the URL against the replacement definition', () => {
		const system = fixture.createSystem({
			blacklabApi: createMockApi().blacklabApi,
			corpus: createCorpus(),
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

		const restored = readSearchFormState(replacementRuntime, {
			...committedUrlState.encoded,
			patt: committedUrlState.params.patt,
			filter: committedUrlState.params.filter,
		});
		replacementRuntime.state.replaceState(restored);

		expect(restored.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', message: expect.stringContaining(ids.queryField('advanced')) })]));
		expect(restored.rawOverrides).toEqual({ patt: committedUrlState.params.patt });
		expect(replacementRuntime.state.state.value[ids.metadataFilter('author')]).toEqual({ value: 'Austen', caseSensitive: false });
		expect(replacementRuntime.compile(ids.searchForm('advanced')).params).toMatchObject({
			filter: committedUrlState.params.filter,
		});
	});
});
