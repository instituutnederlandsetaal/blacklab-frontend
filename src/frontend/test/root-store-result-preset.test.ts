// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';
import { computed, shallowRef } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import type { CorpusContext } from '@/app/state/useCorpusContext';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';
import type { CollocationParams, CompiledFormResult, FormParams } from '@/features/form';
import { searchParametersFromState } from '@/features/search/model/active-search';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewStore from '@/features/search/model/results/view-state';
import { createSearchStore } from '@/features/search/model/search-store';
import { createSubmittedSearch } from '@/features/search/model/submitted-search';
import { createLegacySearchStoreGlobals } from '@/interop/legacy-store-adapters/search';

const corpus = { allMetadataFields: [], relations: { spans: {} } } as never;
const customizationRegistry = createCustomizationRegistry(corpus);
const customizations = createCustomizations(customizationRegistry, corpus, UIStore.getState, UIStore.actions.results.shared.concordanceAnnotationId);
const submittedSearch = createSubmittedSearch();
const searchStore = createSearchStore(submittedSearch);
const { searchFromSubmit } = searchStore.actions;

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
	InterfaceStore.actions.viewedResults(null);
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

		const { root } = createLegacySearchStoreGlobals(activeSearchParameters, searchStore);
		root.actions.searchFromSubmit(submitted);

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
		expect(ViewStore.getOrCreateModule('docs').getState()).toMatchObject({
			groupBy: ['field:date'],
			groupDisplayMode: 'tokens',
			sort: 'field:author',
		});
		expect(root.get.blacklabParameters()).toMatchObject(submitted.params);
	});

	test('honors a preferred docs view even when patt is present', () => {
		resetStores();

		searchFromSubmit(snapshot({ patt: '[word="water"]' }, { targetView: 'docs' }));

		expect(InterfaceStore.get.viewedResults()).toBe('docs');
	});

	test('falls back to patt-based view selection when no target preference exists', () => {
		resetStores();
		searchFromSubmit(snapshot({ patt: '[word="water"]' }));
		expect(InterfaceStore.get.viewedResults()).toBe('hits');

		searchFromSubmit(snapshot({}));
		expect(InterfaceStore.get.viewedResults()).toBe('docs');
	});

	test('reapplies form-owned result state on an unchanged submit', () => {
		resetStores();
		const submitted = snapshot({ group: 'field:submitted', sort: 'field:submitted' }, { targetView: 'docs', resultPreset: 'table' });
		searchFromSubmit(submitted);
		const view = ViewStore.getOrCreateModule('docs');
		const pageSize = view.getState().number;
		view.actions.groupBy(['field:manual']);
		view.actions.viewGroup('field:manual');
		view.actions.sort('field:manual');
		view.actions.groupDisplayMode('docs');
		view.actions.range({ first: 40, number: 10 });
		InterfaceStore.actions.viewedResults('hits');

		searchFromSubmit(submitted);

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
		searchFromSubmit(submitted);
		const view = ViewStore.getOrCreateModule('hits');
		const pageSize = view.getState().number;
		view.actions.groupBy(['field:manual']);
		view.actions.sort('field:manual');
		view.actions.groupDisplayMode('docs');
		view.actions.range({ first: 40, number: 10 });

		searchFromSubmit(submitted);

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
		searchFromSubmit(snapshot({ patt: '[word="water"]', withspans }));
		expect(activeSearchParameters.value?.withspans).toBe(withspans);
	});

	test.each([
		[true, false],
		[undefined, true],
	] as const)('uses the explicit withspans customization over compiled %s', (compiled, customized) => {
		resetStores();
		vi.spyOn(customizationRegistry.legacyApi.value!.search.pattern, 'shouldAddWithSpans').mockReturnValue(customized!);
		searchFromSubmit(snapshot({ patt: '[word="water"]', withspans: compiled }));
		expect(activeSearchParameters.value?.withspans).toBe(customized);
	});

	test('constructs explicit effective collocation parameters with compiled context ownership', () => {
		resetStores();
		GlobalResultsStore.actions.context(9);
		GlobalResultsStore.actions.sampleMode('count');
		GlobalResultsStore.actions.sampleSize(7);
		GlobalResultsStore.actions.sampleSeed(123);

		searchFromSubmit(
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

		searchFromSubmit(snapshot(collocationParams(), { resultPreset: 'table' }));

		expect(view.getState()).toMatchObject({ collocationScorer: 'coll-dice', groupBy: [], viewGroup: null, sort: 'score', groupDisplayMode: 'table' });
	});

	test('rejects collocations without an executable pattern or outside the proximity gate', () => {
		resetStores();
		searchFromSubmit(snapshot(collocationParams({ patt: undefined })));
		expect(activeSearchParameters.value).toBeUndefined();

		searchFromSubmit(snapshot(collocationParams({ colltype: 'relsources', context: undefined })));
		expect(activeSearchParameters.value).toBeUndefined();
	});
});
