// @vitest-environment jsdom

import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import { searchFormIds as ids } from '@/customization-api/shared/form/ids';
import type { CqlQueryBuilderData } from '@/features/cql-query-builder/model';
import { FormSystem, type CollocationFieldState, type ParallelFieldState } from '@/features/form';

import { createCorpus, createParallelCorpus, createSearchFormFixture, readSearchFormState, selectRenderedForm, type SearchFormFixture } from './search-form-fixture';

import { optionLabel, optionText, type OptionText } from '@/shared/utils/options';

let fixture: SearchFormFixture;

beforeEach(() => {
	fixture = createSearchFormFixture();
});

afterEach(() => {
	fixture.scope.stop();
	vi.restoreAllMocks();
});

enableAutoUnmount(afterEach);

describe('Search query forms', () => {
	test('flattens a singular metadata group instead of rendering one filter tab', () => {
		const corpus = createCorpus();
		corpus.metadataGroups = [corpus.metadataGroups[0]];
		corpus.metadataFieldGroups = [corpus.metadataFieldGroups[0]];
		const runtime = fixture.createRuntime(corpus);
		const filters = runtime.definition.getContainer(ids.sharedFilters());
		const onlyGroup = runtime.definition.getContainer(ids.filterTab('Bibliographic'));

		expect(filters?.mode).toBe('all');
		expect(onlyGroup?.title).toBeUndefined();
		expect(onlyGroup?.layout).toBe('list');
		expect(runtime.definition.getField(ids.metadataFilter('author'))).not.toBeNull();
	});

	test('builds an advanced form with a configured querybuilder', () => {
		const runtime = fixture.createRuntime();
		const field = runtime.definition.getField(ids.queryField('advanced'));

		expect(runtime.definition.getForm(ids.searchForm('advanced'))).not.toBeNull();
		expect((field as unknown as { options: { defaultAnnotationId: string } }).options.defaultAnnotationId).toBe('word');
	});

	test('omits the advanced form when the legacy configuration disables it', () => {
		UIStore.getState().search.advanced.enabled = false;

		const runtime = fixture.createRuntime();

		expect(runtime.definition.getForm(ids.searchForm('advanced'))).toBeNull();
		expect(runtime.definition.getContainer(ids.searchFormsContainer())?.children.map(child => child.id)).toEqual([ids.searchForm('simple'), ids.searchForm('extended'), ids.searchForm('expert')]);
	});

	test('applies the large simple-search presentation to regular and parallel query fields', () => {
		const regularField = fixture.createRuntime().definition.getField(ids.queryField('simple'));
		const parallelField = fixture.createRuntime(createParallelCorpus()).definition.getField(ids.queryField('simple')) as unknown as {
			childFieldTemplate: { size?: unknown; controls?: unknown };
		};

		expect(regularField).toMatchObject({ size: 'large', controls: 'simple' });
		expect(parallelField.childFieldTemplate).toMatchObject({ size: 'large', controls: 'simple' });
	});

	test('wraps the advanced querybuilder for a parallel corpus', () => {
		const runtime = fixture.createRuntime(createParallelCorpus());
		const state = runtime.state.state.value[ids.queryField('advanced')] as ParallelFieldState;
		const sourceState = state.childStates.contents__en as CqlQueryBuilderData;
		const attribute = sourceState.tokens[0].rootAttributeGroup.entries[0];
		if ('annotationId' in attribute) attribute.values = ['water'];

		expect(runtime.definition.getField(ids.queryField('advanced'))).not.toBeNull();
		expect(runtime.definition.getField(ids.queryFieldTemplate('advanced'))).toBeNull();
		expect(runtime.compile(ids.searchForm('advanced'))).toMatchObject({
			params: { patt: '[word="water"]', searchfield: 'contents__en' },
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
		const runtime = fixture.createRuntime(corpus);

		runtime.state.state.value[ids.queryField('expert')] = '[lemma="water"]';
		runtime.state.state.value[ids.withinField()] = { element: 's', attributes: {} };
		runtime.state.state.value[ids.metadataFilter('author')] = { value: 'Austen', caseSensitive: false };

		const compiled = runtime.compile(ids.searchForm('expert'));
		expect(compiled).toMatchObject({
			params: { filter: 'author:(Austen)', patt: '([lemma="water"]) within <s/>' },
		});
		expect(compiled.params.withspans).toBeUndefined();
	});

	test('configures the expert heading and raw CQL field presentation', () => {
		const runtime = fixture.createRuntime();
		selectRenderedForm(runtime, ids.searchForm('expert'));

		const wrapper = mount(FormSystem, {
			props: { runtime },
		});
		expect(wrapper.get('.blf-heading-view h3 a').attributes('href')).toBe('https://blacklab.ivdnt.org/guide/corpus-query-language.html');
		expect(wrapper.find('.blf-expert-query-field > label').exists()).toBe(false);
		expect(wrapper.get('.blf-expert-query-field textarea').attributes('aria-label')).toBe('search.expert.corpusQueryLanguage');
	});

	test('restores a canonical raw query into the expert form', () => {
		const runtime = fixture.createRuntime();
		const restored = readSearchFormState(runtime, {
			patt: '[lemma="water"]',
		});
		runtime.state.replaceState(restored);

		expect(restored.issues).toEqual([]);
		expect(runtime.state.state.value[ids.queryField('expert')]).toBe('[lemma="water"]');
		expect(runtime.compile(ids.searchForm('expert')).params.patt).toBe('[lemma="water"]');
	});

	test('wraps the expert query for a parallel corpus', () => {
		const runtime = fixture.createRuntime(createParallelCorpus());
		const state = runtime.state.state.value[ids.queryField('expert')] as ParallelFieldState;

		expect(runtime.definition.getField(ids.queryField('expert'))).not.toBeNull();
		expect(runtime.definition.getField(ids.queryFieldTemplate('expert'))).toBeNull();
		state.childStates.contents__en = '[lemma="water"]';
		state.targets = ['contents__nl'];
		state.childStates.contents__nl = '[lemma="water"]';
		expect(runtime.compile(ids.searchForm('expert'))).toMatchObject({
			params: { patt: '[lemma="water"] ==>nl? [lemma="water"]', searchfield: 'contents__en' },
		});
	});

	test('extended form compiles annotation fields with shared filters', () => {
		const definition = fixture.createRuntime();

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

		expect(compiled.params.patt).toBe('[word="water"]');
		expect(compiled.params.filter).toBe('(author:(Austen) AND genre:(fiction))');
		expect(compiled.summaries).toEqual([
			{ group: 'Basics', label: 'word', value: 'water', summaryType: ['patt'] },
			{ group: 'Bibliographic', label: 'author', value: 'Austen', summaryType: ['filter'] },
			{ group: 'Classification', label: 'genre', value: 'Fiction', summaryType: ['filter'] },
		]);
	});

	test('simple form excludes configured shared filters', () => {
		const definition = fixture.createRuntime();

		definition.state.state.value[ids.queryField('simple')] = {
			value: 'water',
			caseSensitive: false,
		};
		definition.state.state.value[ids.metadataFilter('author')] = {
			value: 'Austen',
			caseSensitive: false,
		};

		expect(definition.compile(ids.searchForm('simple')).params).toEqual({ patt: '[word="water"]' });
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
		state.search.shared.within.sentenceElement = 's';

		const runtime = fixture.createRuntime(corpus);
		const within = runtime.definition.getField(ids.withinField()) as unknown as {
			options: Array<{ value: string; label?: OptionText; title?: OptionText | null }>;
		};
		const collocations = runtime.definition.getField(ids.collocationsField()) as unknown as { defaultWithin: string };

		expect(within.options.map(option => option.value)).toEqual(['', 'p', 's']);
		expect(within.options.map(optionLabel)).toEqual(['', 'Custom paragraph', 'Custom sentence']);
		expect(within.options.map(option => optionText(option.title))).toEqual([undefined, 'Paragraph title', null]);
		expect(collocations.defaultWithin).toBe('s');
		expect((runtime.state.state.value[ids.collocationsField()] as CollocationFieldState).within).toBe('s');
	});

	test('uses the configured align-by visibility, options, and default', () => {
		const state = UIStore.getState();
		state.search.shared.alignBy.elements = [
			{ value: 'sentence-alignment', label: 'By sentence', title: 'Sentence alignment' },
			{ value: 'word-alignment', label: 'By word', title: null },
		];
		state.search.shared.alignBy.defaultValue = 'sentence-alignment';

		const hiddenDefinition = fixture.createRuntime(createParallelCorpus());
		const hiddenField = hiddenDefinition.definition.getField(ids.queryField('simple')) as unknown as { alignByOptions: unknown[] };
		expect(hiddenField.alignByOptions).toEqual([]);
		expect((hiddenDefinition.state.state.value[ids.queryField('simple')] as { alignBy: string | null }).alignBy).toBe('sentence-alignment');

		state.search.shared.alignBy.enabled = true;
		const visibleDefinition = fixture.createRuntime(createParallelCorpus());
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
		const definition = fixture.createRuntime(corpus);
		const restored = readSearchFormState(definition, {
			'f.form': ids.searchForm('simple'),
			'f.word': 'schip',
			patt: '[word_or_lemma="(?i)schip"]',
		});
		definition.state.replaceState(restored);
		selectRenderedForm(definition, ids.searchForm('extended'));
		const currentWithinState = definition.state.state.value[ids.withinField()] as { element: string | null; attributes: Record<string, string> };
		const withinStateBeforeMount = { element: currentWithinState.element, attributes: { ...currentWithinState.attributes } };
		expect(withinStateBeforeMount).toEqual({ element: null, attributes: {} });

		mount(FormSystem, { props: { runtime: definition } });
		await nextTick();

		expect(definition.state.state.value[ids.withinField()]).toEqual(withinStateBeforeMount);
	});

	test('restores the extended annotation value from scoped URL state', () => {
		const state = UIStore.getState();
		state.search.extended.searchAnnotationIds = ['word_or_lemma', 'pos'];
		const definition = fixture.createRuntime();
		const restored = readSearchFormState(definition, {
			'f.form': ids.searchForm('extended'),
			'f.word_or_lemma': 'schip',
			patt: '[word_or_lemma="(?i)schip"]',
			searchfield: 'contents',
		});
		definition.state.replaceState(restored);

		expect(restored.issues).toEqual([]);
		expect(definition.state.state.value[ids.annotationField('extended', 'contents', 'word_or_lemma')]).toEqual({
			value: 'schip',
			caseSensitive: false,
		});
		expect(restored.rawOverrides).toEqual({ patt: '[word_or_lemma="(?i)schip"]' });
		expect(definition.compile(ids.searchForm('extended'))).toMatchObject({
			encoded: {
				'f.form': ids.searchForm('extended'),
				'f.word_or_lemma': 'schip',
			},
			params: { patt: '[word_or_lemma="(?i)schip"]' },
		});
	});

	test('activates the extended annotation tab that contains restored values', () => {
		const state = UIStore.getState();
		state.search.extended.searchAnnotationIds = ['word_or_lemma', 'pos'];
		const definition = fixture.createRuntime();
		const restored = readSearchFormState(definition, { 'f.form': ids.searchForm('extended'), 'f.pos': 'NOU' });

		expect(restored.uiState[ids.annotationTabs()]).toBe(ids.annotationTab('Grammar'));
		expect(restored.uiState[ids.annotationTab('Grammar')]).toBe(ids.annotationField('extended', 'contents', 'pos'));
	});
});
