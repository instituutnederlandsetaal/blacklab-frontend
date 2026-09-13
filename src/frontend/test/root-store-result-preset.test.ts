// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed, shallowRef } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import type { CollocationParams, CompiledFormResult, FormParams } from '@/features/form';
import { searchParametersFromState } from '@/features/search/model/active-search';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import { handoffCompiledForm } from '@/features/search/model/new-form/form-state-bridge';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSearchSummary } from '@/features/search/model/search-summary';
import { createSubmittedFormRestoration, createSubmittedSearch } from '@/features/search/model/submitted-search';

const corpus = { allMetadataFields: [], relations: { spans: {} } } as never;
const customizationRegistry = createCustomizationRegistry(corpus);
const customizations = createCustomizations(customizationRegistry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
RootStore.setCustomizations(customizations);
const submittedSearch = createSubmittedSearch();
RootStore.setSubmittedSearch(submittedSearch);

const activeCorpus = shallowRef<CorpusContext['index']>();
const activeSearchParameters = computed(() =>
	searchParametersFromState(InterfaceStore.get.viewedResults, {
		corpus: activeCorpus,
		submitted: submittedSearch,
		global: GlobalResultsStore.getState,
		viewState: () => {
			const view = InterfaceStore.get.viewedResults();
			return typeof view === 'string' && view ? ViewStore.getOrCreateModule(view).getState() : undefined;
		},
		expandedRequestRange: () => {
			const view = InterfaceStore.get.viewedResults();
			return typeof view === 'string' && view ? ViewStore.getOrCreateModule(view).get.expandedRequestRange() : undefined;
		},
		withSpans: customizations.searchWithSpans,
		debug: false,
	}),
);
function resetStores() {
	ViewStore.setPageSizePreference(() => GlobalResultsStore.getState().pageSize);
	submittedSearch.value = undefined;
	const context = {
		index: {
			id: 'test',
			allAnnotations: [],
			allAnnotationsMap: {},
			firstMainAnnotation: { id: 'word', uiType: 'text' },
			hasRelations: false,
			mainAnnotatedField: 'contents',
			parallelAnnotatedFields: [],
			parallelAnnotatedFieldsMap: {},
		},
	} as any as CorpusContext;
	InterfaceStore.actions.reset();
	ExploreStore.actions.reset();
	FilterStore.init({ index: undefined } as CorpusContext);
	PatternStore.init(context, customizations);
	activeCorpus.value = context.index;
	ViewStore.init({} as CorpusContext);
	GlobalResultsStore.init({} as CorpusContext);
}

function snapshot(params: FormParams, extra: Partial<CompiledFormResult> = {}): CompiledFormResult {
	return {
		formId: 'search.form',
		encoded: { 'f.form': 'search.form' },
		issues: [],
		params,
		summaries: [],
		...extra,
	};
}

function submitNewForm(result: CompiledFormResult) {
	RootStore.actions.searchFromSubmit(result);
}

function collocationParams(params: Partial<CollocationParams> = {}): CollocationParams {
	return {
		patt: '[word="water"]',
		colltype: 'proximity',
		context: 5,
		annotation: 'lemma',
		sensitive: false,
		scorertype: 'coll-dice',
		...params,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	resetStores();
});

describe('compiled-form result handoff', () => {
	test('applies compiled grouping, sorting, table mode, and preferred view on fresh submit', () => {
		resetStores();
		const submitted = snapshot(
			{ group: 'field:date', sort: 'field:author' },
			{
				formId: 'explore.corpora',
				encoded: { 'f.form': 'explore.corpora' },
				resultPreset: 'tokens',
				targetView: 'docs',
			},
		);

		submitNewForm(submitted);

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: 'field:author',
		});
		expect(activeSearchParameters.value).toMatchObject(submitted.params);
	});

	test('honors a preferred docs view even when patt is present', () => {
		resetStores();

		submitNewForm(snapshot({ patt: '[word="water"]' }, { targetView: 'docs' }));

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
	});

	test('falls back to patt-based view selection when no target preference exists', () => {
		resetStores();
		submitNewForm(snapshot({ patt: '[word="water"]' }));
		expect(InterfaceStore.get.viewedResults()).toBe('hits');

		submitNewForm(snapshot({}));
		expect(InterfaceStore.get.viewedResults()).toBe('docs');
	});

	test('reapplies form-owned result state on an unchanged submit', () => {
		resetStores();
		const submitted = snapshot({ group: 'field:submitted', sort: 'field:submitted' }, { targetView: 'docs', resultPreset: 'table' });
		submitNewForm(submitted);
		const view = ViewStore.getOrCreateModule('docs');
		const pageSize = view.getState().number;
		view.actions.groupBy(['field:manual']);
		view.actions.viewGroup('field:manual');
		view.actions.sort('field:manual');
		view.actions.groupDisplayMode('docs');
		view.actions.range({ first: 40, number: 10 });
		InterfaceStore.actions.viewedResults('hits');

		submitNewForm(submitted);

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(view.getState()).toMatchObject({
			groupBy: ['field:submitted'],
			sort: 'field:submitted',
			groupDisplayMode: 'table',
			first: 0,
			number: pageSize,
			viewGroup: null,
		});
		expect(activeSearchParameters.value).toMatchObject(submitted.params);
	});

	test('preserves manual grouping, sorting, and display mode when the form does not own them', () => {
		resetStores();
		const submitted = snapshot({ patt: '[word="water"]' }, { targetView: 'hits' });
		handoffCompiledForm(submitted);
		const view = ViewStore.getOrCreateModule('hits');
		const pageSize = view.getState().number;
		view.actions.groupBy(['field:manual']);
		view.actions.sort('field:manual');
		view.actions.groupDisplayMode('docs');
		view.actions.range({ first: 40, number: 10 });

		handoffCompiledForm(submitted);

		expect(view.getState()).toMatchObject({
			groupBy: ['field:manual'],
			sort: 'field:manual',
			groupDisplayMode: 'docs',
			first: 0,
			number: pageSize,
		});
	});

	test.each([true, undefined] as const)('uses compiled withspans=%s for the result request', withspans => {
		resetStores();
		submitNewForm(snapshot({ patt: '[word="water"]', withspans }));
		expect(activeSearchParameters.value?.withspans).toBe(withspans);
	});

	test('derives legacy withspans from submitted active filters, not registered controls', () => {
		resetStores();
		InterfaceStore.actions.form('search');
		InterfaceStore.actions.patternMode('expert');
		PatternStore.actions.expert.query('[word="water"]');
		FilterStore.actions.registerFilter({
			id: 'span:speech:person',
			componentName: 'filter-text',
			behaviourName: 'span-text',
			defaultDisplayName: 'Speaker',
			metadata: { name: 'speech', attribute: 'person' },
		});

		RootStore.actions.searchFromSubmit();
		expect(activeSearchParameters.value?.withspans).toBeUndefined();

		FilterStore.actions.filterValue({ id: 'span:speech:person', value: 'Alice' });
		RootStore.actions.searchFromSubmit();
		expect(activeSearchParameters.value).toMatchObject({
			patt: '([word="water"]) within <speech person="Alice"/>',
			withspans: true,
		});
	});

	test('captures legacy summaries on submit so later draft edits do not change them', () => {
		resetStores();
		InterfaceStore.actions.patternMode('expert');
		PatternStore.actions.expert.query('[word="water"]');
		FilterStore.actions.registerFilter({ id: 'author', componentName: 'filter-text', defaultDisplayName: 'Author', metadata: undefined });
		FilterStore.actions.filterValue({ id: 'author', value: 'Alice' });
		RootStore.actions.searchFromSubmit();
		const summary = createSearchSummary(submittedSearch, createSubmittedFormRestoration(submittedSearch, null));
		expect(summary.value).toEqual({ pattern: '[word="water"]', filter: 'Author: Alice' });

		PatternStore.actions.expert.query('[word="ship"]');
		FilterStore.actions.filterValue({ id: 'author', value: 'Bob' });
		ViewStore.getOrCreateModule('hits').actions.first(20);
		expect(summary.value).toEqual({ pattern: '[word="water"]', filter: 'Author: Alice' });
	});

	test.each([
		[true, false],
		[undefined, true],
	] as const)('uses the explicit withspans customization over compiled %s', (compiled, customized) => {
		resetStores();
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(customized!);
		submitNewForm(snapshot({ patt: '[word="water"]', withspans: compiled }));
		expect(activeSearchParameters.value?.withspans).toBe(customized);
	});

	test('keeps legacy Documents result handling separate from compiled-form handoff', () => {
		resetStores();
		InterfaceStore.actions.form('explore');
		InterfaceStore.actions.exploreMode('corpora');
		ExploreStore.actions.corpora.groupBy('field:date');
		ExploreStore.actions.corpora.groupDisplayMode('tokens');

		RootStore.actions.searchFromSubmit();

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: null,
		});
	});

	test('constructs explicit effective collocation parameters with compiled context ownership', () => {
		resetStores();
		GlobalResultsStore.actions.context(9);
		GlobalResultsStore.actions.sampleMode('count');
		GlobalResultsStore.actions.sampleSize(7);
		GlobalResultsStore.actions.sampleSeed(123);

		submitNewForm(
			snapshot(
				collocationParams({
					collpatt: '[word="sea"]',
					filter: 'author:Austen',
					searchfield: 'contents__nl',
					context: '3:4',
					within: 's',
					annotation: 'word',
					sensitive: true,
					scorertype: 'coll-salience',
					sort: '-size',
				}),
				{ targetView: 'docs', resultPreset: 'table' },
			),
		);

		const params = activeSearchParameters.value;
		expect(params).toMatchObject({
			patt: '[word="water"]',
			collpatt: '[word="sea"]',
			filter: 'author:Austen',
			field: 'contents__nl',
			searchfield: 'contents__nl',
			colltype: 'proximity',
			context: '3:4',
			within: 's',
			annotation: 'word',
			sensitive: true,
			scorertype: 'coll-salience',
			samplenum: 7,
			sampleseed: 123,
			sort: '-size',
		});
		expect(params).not.toHaveProperty('group');
		expect(params).not.toHaveProperty('viewgroup');
		expect(params).not.toHaveProperty('pattgapdata');
		expect(params).not.toHaveProperty('adjusthits');
		expect(params).not.toHaveProperty('withspans');
		expect(InterfaceStore.get.viewedResults()).toBe('hits');
		expect(ViewStore.getOrCreateModule('hits').getState()).toMatchObject({ collocationScorer: 'coll-salience', groupBy: [], viewGroup: null, sort: '-size', groupDisplayMode: 'table' });
	});

	test('clears stale ordinary result state on a fresh collocation submit', () => {
		resetStores();
		const view = ViewStore.getOrCreateModule('hits');
		view.actions.collocationScorer('coll-salience');
		view.actions.groupBy(['field:author']);
		view.actions.viewGroup('author:Austen');
		view.actions.sort('field:title');

		submitNewForm(snapshot(collocationParams(), { resultPreset: 'table' }));

		expect(view.getState()).toMatchObject({ collocationScorer: 'coll-dice', groupBy: [], viewGroup: null, sort: 'score', groupDisplayMode: 'table' });
	});

	test('rejects collocations without an executable pattern or outside the proximity gate', () => {
		resetStores();
		submitNewForm(snapshot(collocationParams({ patt: undefined })));
		expect(activeSearchParameters.value).toBeUndefined();

		submitNewForm(snapshot(collocationParams({ colltype: 'relsources', context: undefined })));
		expect(activeSearchParameters.value).toBeUndefined();
	});
});
